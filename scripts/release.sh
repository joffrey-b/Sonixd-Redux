#!/usr/bin/env bash
set -e

VERSION="$1"

if [ -z "$VERSION" ]; then
  echo "Usage: ./scripts/release.sh <version>"
  echo "Example: ./scripts/release.sh 0.16.5"
  exit 1
fi

if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Error: version must be in x.y.z format (e.g. 0.16.5)"
  exit 1
fi

TAG="v$VERSION"

# Refuse to run with uncommitted changes that aren't the version bump itself
if ! git diff --quiet HEAD -- . ':!src/package.json'; then
  echo "Error: you have uncommitted changes. Commit or stash them before releasing."
  exit 1
fi

# Bump src/package.json
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('src/package.json', 'utf8'));
pkg.version = '$VERSION';
fs.writeFileSync('src/package.json', JSON.stringify(pkg, null, 2) + '\n');
"
echo "Bumped src/package.json to $VERSION"

git add src/package.json
git commit -m "Bump version to $VERSION"
git push

git tag "$TAG"
git push origin "$TAG"

echo ""
echo "Done. Tag $TAG pushed — Windows, Linux and macOS builds are now running on GitHub Actions."
