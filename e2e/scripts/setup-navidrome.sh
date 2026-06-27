#!/usr/bin/env bash
set -e

BASE="http://localhost:4533"

echo "Creating Navidrome admin user..."
curl -sf -X POST "$BASE/auth/createAdmin" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' || echo "(admin may already exist)"

echo "Waiting for library scan..."
TOKEN=$(curl -sf -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Navidrome's scan is progressive, not atomic — on a fresh container (empty
# e2e_navidrome-data volume, as every CI run gets) polling for "count > 0" can
# catch it after only the first of the 5 test tracks has been indexed, letting
# the suite start against a still-incomplete library. Wait for the full expected
# count instead. Keep this in sync with the number of TRACKS entries in
# e2e/fixtures/constants.ts (currently: track01-03, soloTrack, jazzTrack = 5).
EXPECTED_TRACKS=5

ELAPSED=0
until [ "$ELAPSED" -ge 60 ]; do
  COUNT=$(curl -sf -H "x-nd-authorization: Bearer $TOKEN" \
    "$BASE/api/song?_end=100" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
  if [ -n "$COUNT" ] && [ "$COUNT" -ge "$EXPECTED_TRACKS" ]; then
    echo "Navidrome scan complete: $COUNT tracks found."
    break
  fi
  sleep 3
  ELAPSED=$((ELAPSED + 3))
done

if [ "$ELAPSED" -ge 60 ]; then
  echo "WARNING: Navidrome scan may not be complete yet ($COUNT/$EXPECTED_TRACKS tracks found)."
fi

# Imported playlist for e2e/tests/library/playlist-imported.spec.ts
# ("e2e/test-music/Imported Mix.m3u"). Navidrome only attributes an imported
# M3U playlist to a real owner once an admin account exists — the very first
# scan (ND_SCANSCHEDULE=@startup in docker-compose.yml) runs before the admin
# user is created above, so it logs "Playlists will not be imported, as there
# are no admin users yet" and skips it. Creating the admin account
# automatically triggers Navidrome's own follow-up scan, but that one is
# fullScan=false (incremental) — confirmed from the container logs showing it
# completes in a few ms with zero folders reprocessed. An incremental scan
# only looks at files it considers changed, and the playlist file hasn't
# changed since the first pass that rejected it, so it's silently skipped
# again. fullScan=true on startScan.view forces Navidrome to re-examine
# every file, including the playlist, now that admin exists.
echo "Triggering a full rescan so the existing playlist file gets imported under admin..."
curl -sf "$BASE/rest/startScan.view?u=admin&p=admin&v=1.15.0&c=e2e&f=json&fullScan=true" > /dev/null \
  || echo "(startScan request failed)"

ELAPSED=0
until [ "$ELAPSED" -ge 60 ]; do
  SCANNING=$(curl -sf "$BASE/rest/getScanStatus.view?u=admin&p=admin&v=1.15.0&c=e2e&f=json" \
    | python3 -c "import sys, json; print(json.load(sys.stdin)['subsonic-response']['scanStatus']['scanning'])" 2>/dev/null || echo "True")
  if [ "$SCANNING" = "False" ]; then
    echo "Rescan complete."
    break
  fi
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done

echo "Waiting for imported playlist to appear..."
export EXPECTED_PLAYLIST_NAME="Imported Mix"
ELAPSED=0
FOUND="no"
until [ "$ELAPSED" -ge 30 ]; do
  FOUND=$(curl -sf "$BASE/rest/getPlaylists.view?u=admin&p=admin&v=1.15.0&c=e2e&f=json" \
    | python3 -c "
import sys, json, os
d = json.load(sys.stdin)['subsonic-response'].get('playlists', {}).get('playlist', [])
names = [p['name'] for p in d]
print('yes' if os.environ['EXPECTED_PLAYLIST_NAME'] in names else 'no')
" 2>/dev/null || echo "no")
  if [ "$FOUND" = "yes" ]; then
    echo "Imported playlist '$EXPECTED_PLAYLIST_NAME' found."
    break
  fi
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done

if [ "$FOUND" != "yes" ]; then
  echo "WARNING: Imported playlist '$EXPECTED_PLAYLIST_NAME' was not found after rescan."
fi

# Internet radio station for e2e/tests/playback/internet-radio.spec.ts. A real
# station rather than a synthetic static file: radio-mode detection in this app
# is purely entity-type-based (isRadio is set when the queue entry comes from
# the Internet Radio list, regardless of what the stream actually does — see
# src/components/radio/InternetRadioList.tsx), so no special infinite-stream
# infrastructure is needed either way; using the real stream is simply more
# realistic and avoids standing up new Docker infra for this.
echo "Adding test internet radio station..."
RADIO_NAME=$(python3 -c "import urllib.parse; print(urllib.parse.quote('La grosse radio metal'))")
RADIO_STREAM_URL=$(python3 -c "import urllib.parse; print(urllib.parse.quote('https://hd.lagrosseradio.info/lagrosseradio-metal-192.mp3', safe=''))")
RADIO_HOMEPAGE_URL=$(python3 -c "import urllib.parse; print(urllib.parse.quote('https://www.lagrosseradio.com/', safe=''))")
curl -sf "$BASE/rest/createInternetRadioStation.view?u=admin&p=admin&v=1.15.0&c=e2e&f=json&streamUrl=$RADIO_STREAM_URL&name=$RADIO_NAME&homepageUrl=$RADIO_HOMEPAGE_URL" \
  > /dev/null || echo "(radio station creation request failed)"

EXPECTED_RADIO_STATIONS=1
ELAPSED=0
until [ "$ELAPSED" -ge 30 ]; do
  RADIO_COUNT=$(curl -sf "$BASE/rest/getInternetRadioStations.view?u=admin&p=admin&v=1.15.0&c=e2e&f=json" \
    | python3 -c "import sys,json; d=json.load(sys.stdin)['subsonic-response'].get('internetRadioStations',{}).get('internetRadioStation',[]); print(len(d))" 2>/dev/null || echo "0")
  if [ -n "$RADIO_COUNT" ] && [ "$RADIO_COUNT" -ge "$EXPECTED_RADIO_STATIONS" ]; then
    echo "Internet radio station ready: $RADIO_COUNT station(s) found."
    exit 0
  fi
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done

echo "WARNING: Internet radio station may not be ready yet ($RADIO_COUNT/$EXPECTED_RADIO_STATIONS found)."
