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
USER_ID=$(echo "$AUTH_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['User']['Id'])" 2>/dev/null || true)

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
SCAN_OK=0
until [ "$ELAPSED" -ge 90 ]; do
  COUNT=$(curl -sf \
    -H "Authorization: MediaBrowser Token=\"$TOKEN\"" \
    "$BASE/Items?IncludeItemTypes=MusicAlbum&Recursive=true&Limit=1" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('TotalRecordCount',0))" 2>/dev/null || echo "0")
  if [ "$COUNT" -ge "$EXPECTED_ALBUMS" ]; then
    echo "Jellyfin scan complete: $COUNT albums found."
    SCAN_OK=1
    break
  fi
  sleep 5
  ELAPSED=$((ELAPSED + 5))
done

if [ "$SCAN_OK" -ne 1 ]; then
  echo "ERROR: Jellyfin library scan did not complete within 90s — only $COUNT/$EXPECTED_ALBUMS albums found." >&2
  exit 1
fi

# Test playlist for e2e/tests/library/offline-browsing.spec.ts's Jellyfin
# playlist-sync coverage (Phase 3). Deliberately NOT named "Imported Mix"
# (Navidrome's test playlist name): Jellyfin auto-discovers its own
# "Imported Mix" playlist from the same source M3U every container gets,
# but it always resolves to 0 songs via GET /Playlists/{id}/Items (confirmed
# against a live container — Jellyfin's M3U path-resolution differs from
# Navidrome's real, working import). Two playlists sharing that exact name
# would make `getByText('Imported Mix').first()` in the E2E test ambiguous
# between the real one and the always-empty auto-discovered one. Using a
# distinct name sidesteps that instead of trying to disambiguate them in
# the test. Created directly via POST /Playlists with explicit song ids —
# confirmed working end-to-end (create, list, verify item count, delete)
# against a live container during this phase's investigation.
PLAYLIST_NAME="E2E Test Playlist"

echo "Checking for an existing test playlist..."
FOUND=$(curl -sf \
  -H "Authorization: MediaBrowser Token=\"$TOKEN\"" \
  "$BASE/Items?IncludeItemTypes=Playlist&Recursive=true" \
  | python3 -c "
import sys, json
items = json.load(sys.stdin).get('Items', [])
print('yes' if any(i['Name'] == '$PLAYLIST_NAME' for i in items) else 'no')
" 2>/dev/null || echo "no")

# Idempotent — this container's data volume is not guaranteed to be fresh on
# every run (observed persisting across hours-long local sessions during
# this phase's own investigation), and Jellyfin allows duplicate playlist
# names with no uniqueness constraint, so re-running this script must not
# accumulate a new copy each time. Unlike Jellyfin's own auto-discovered
# "Imported Mix", this exact name is never created by anything else, so a
# plain existence check (not a content check) is sufficient here.
if [ "$FOUND" = "yes" ]; then
  echo "Test playlist '$PLAYLIST_NAME' already exists — skipping creation."
  exit 0
fi

echo "Creating test playlist..."
SONG_IDS=$(curl -sf \
  -H "Authorization: MediaBrowser Token=\"$TOKEN\"" \
  "$BASE/Items?IncludeItemTypes=Audio&Recursive=true&Limit=3" \
  | python3 -c "import sys,json; print(','.join('\"%s\"' % i['Id'] for i in json.load(sys.stdin)['Items']))" 2>/dev/null || true)

if [ -z "$SONG_IDS" ]; then
  echo "WARNING: No songs found to build the test playlist from — skipping."
else
  CREATE_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/Playlists" \
    -H "Content-Type: application/json" \
    -H "Authorization: MediaBrowser Token=\"$TOKEN\"" \
    -d "{\"Name\":\"$PLAYLIST_NAME\",\"Ids\":[$SONG_IDS],\"UserId\":\"$USER_ID\",\"MediaType\":\"Audio\"}")
  echo "Playlists POST HTTP $CREATE_HTTP"

  ELAPSED=0
  READY="no"
  until [ "$ELAPSED" -ge 30 ]; do
    READY=$(curl -sf \
      -H "Authorization: MediaBrowser Token=\"$TOKEN\"" \
      "$BASE/Items?IncludeItemTypes=Playlist&Recursive=true" \
      | python3 -c "
import sys, json
items = json.load(sys.stdin).get('Items', [])
print('yes' if any(i['Name'] == '$PLAYLIST_NAME' for i in items) else 'no')
" 2>/dev/null || echo "no")
    if [ "$READY" = "yes" ]; then
      echo "Test playlist '$PLAYLIST_NAME' ready."
      break
    fi
    sleep 2
    ELAPSED=$((ELAPSED + 2))
  done

  if [ "$READY" != "yes" ]; then
    echo "WARNING: Test playlist '$PLAYLIST_NAME' was not found after creation."
  fi
fi

exit 0
