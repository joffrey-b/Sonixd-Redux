#!/usr/bin/env bash
set -e

VERSION="$1"

if [ -z "$VERSION" ]; then
  echo "Usage: ./scripts/publish-github.sh <version>"
  echo "Example: ./scripts/publish-github.sh 1.0.1"
  exit 1
fi

if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Error: version must be in x.y.z format (e.g. 1.0.1)"
  exit 1
fi

TAG="v$VERSION"
BRANCH="release-$VERSION"

if ! git diff --quiet HEAD; then
  echo "Error: you have uncommitted changes. Commit or stash them before publishing."
  exit 1
fi

# Clean up temp branch if it already exists from a failed previous run
git branch -D "$BRANCH" 2>/dev/null || true

echo "Fetching GitHub..."
git fetch github

echo "Creating release branch from github/main..."
git checkout -b "$BRANCH" github/main

echo "Squashing changes..."
git merge --squash -X theirs main

# Set the correct public version (local GitLab builds may be ahead, e.g. 1.0.8)
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('src/package.json', 'utf8'));
pkg.version = '$VERSION';
fs.writeFileSync('src/package.json', JSON.stringify(pkg, null, 2) + '\n');
"
git add src/package.json

git commit -m "Sonixd Redux V$VERSION"

echo "Pushing to GitHub main..."
git push github "$BRANCH":main

echo "Tagging..."
# Push tag directly by commit SHA to avoid touching local tags,
# which are already used for GitLab test builds with different commits.
COMMIT=$(git rev-parse HEAD)
git push github "$COMMIT:refs/tags/$TAG"

echo "Cleaning up..."
git checkout main
git branch -D "$BRANCH"

echo "Syncing github/main into local main..."
git fetch github
git merge github/main -X ours --no-edit

echo ""
echo "Done. Tag $TAG pushed to GitHub — Linux, macOS and Windows builds are now running."
