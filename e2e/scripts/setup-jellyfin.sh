#!/usr/bin/env bash
set -e

BASE="http://localhost:8096"
AUTH_HEADER='MediaBrowser Client="E2E", Device="Test", DeviceId="test-device-001", Version="1.0"'

# Check wizard state without touching auth endpoints
WIZARD_COMPLETE=$(curl -s "$BASE/System/Info/Public" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('StartupWizardCompleted', False))" 2>/dev/null || echo "False")

if [ "$WIZARD_COMPLETE" = "True" ]; then
  echo "Startup wizard already complete — skipping."
else
  echo "Running Jellyfin startup wizard..."

  # On a fresh /config volume, Jellyfin runs a long database seed/migration pass on
  # first boot — /health responds before this finishes, so /Startup/* can 503 with
  # its own "Server still starting" page for a while even though the healthcheck
  # already passed. Retry until migrations actually complete instead of failing fast.
  echo "Waiting for Jellyfin startup wizard to become available..."
  ELAPSED=0
  CONFIG_HTTP=0
  until [ "$CONFIG_HTTP" = "200" ]; do
    CONFIG_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/Startup/Configuration")
    if [ "$CONFIG_HTTP" = "200" ]; then
      break
    fi
    if [ "$ELAPSED" -ge 180 ]; then
      echo "ERROR: Startup/Configuration still returning $CONFIG_HTTP after 180s — Jellyfin migrations may be stuck." >&2
      exit 1
    fi
    sleep 5
    ELAPSED=$((ELAPSED + 5))
  done
  echo "Startup/Configuration GET HTTP $CONFIG_HTTP"

  # Step 2: GET user (advances wizard to user-creation step)
  GETUSER_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/Startup/User")
  echo "Startup/User GET HTTP $GETUSER_HTTP"

  # Step 3: POST user (creates admin account)
  FIRSTUSER_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/Startup/User" \
    -H "Content-Type: application/json" \
    -d '{"Name":"admin","Password":"admin"}')
  echo "Startup/User POST HTTP $FIRSTUSER_HTTP"

  # Step 4: Complete wizard
  COMPLETE_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/Startup/Complete")
  echo "Startup/Complete HTTP $COMPLETE_HTTP"
fi

# Authenticate
echo "Authenticating..."
AUTH_RESPONSE=$(curl -s -X POST "$BASE/Users/AuthenticateByName" \
  -H "Content-Type: application/json" \
  -H "X-Emby-Authorization: $AUTH_HEADER" \
  -d '{"Username":"admin","Pw":"admin"}')

TOKEN=$(echo "$AUTH_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['AccessToken'])" 2>/dev/null || true)

if [ -z "$TOKEN" ]; then
  echo "ERROR: Authentication failed."
  echo "Response: $AUTH_RESPONSE"
  exit 1
fi
echo "Token acquired."

# Add music library. refreshLibrary=true triggers the initial scan, which includes
# the ArtistsPostScanTask responsible for grouping songs into MusicAlbum/MusicArtist
# entities. Do NOT trigger a second /Library/Refresh here — starting a second scan
# while the first one's post-scan task is still running cancels that post-scan task
# (observed in Jellyfin logs as "Post-scan task cancelled: ArtistsPostScanTask"),
# leaving songs indexed as bare Audio items with no album grouping ever created.
LIBFOLDER_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$BASE/Library/VirtualFolders?name=Music&collectionType=music&paths=/media/music&refreshLibrary=true" \
  -H "Content-Type: application/json" \
  -H "Authorization: MediaBrowser Token=\"$TOKEN\"" \
  -d '{"LibraryOptions":{}}')
echo "Library/VirtualFolders POST HTTP $LIBFOLDER_HTTP"

# Wait for albums to actually appear, not just raw audio items — the audio-item
# count goes non-zero before the post-scan grouping step finishes. Wait for the
# full expected album count, not just ">0" — the scan is progressive, and on a
# fresh container polling for "any album" can return after only the first of
# the 3 expected albums has been grouped, letting the suite start against a
# still-incomplete library. Keep in sync with e2e/fixtures/constants.ts's
# TRACKS entries (currently: Test Album, Solo Album, Jazz Album = 3).
EXPECTED_ALBUMS=3
echo "Waiting for Jellyfin library scan..."
ELAPSED=0
until [ "$ELAPSED" -ge 90 ]; do
  COUNT=$(curl -sf \
    -H "Authorization: MediaBrowser Token=\"$TOKEN\"" \
    "$BASE/Items?IncludeItemTypes=MusicAlbum&Recursive=true&Limit=1" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('TotalRecordCount',0))" 2>/dev/null || echo "0")
  if [ "$COUNT" -ge "$EXPECTED_ALBUMS" ]; then
    echo "Jellyfin scan complete: $COUNT albums found."
    exit 0
  fi
  sleep 5
  ELAPSED=$((ELAPSED + 5))
done

echo "ERROR: Jellyfin library scan did not complete within 90s — only $COUNT/$EXPECTED_ALBUMS albums found." >&2
exit 1
