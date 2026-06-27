#!/usr/bin/env bash
set -e

TIMEOUT=120
INTERVAL=5

wait_for() {
  local name=$1
  local url=$2
  local extra_flags=${3:-""}
  local elapsed=0
  echo "Waiting for $name at $url..."
  until curl -sf $extra_flags "$url" > /dev/null 2>&1; do
    if [ $elapsed -ge $TIMEOUT ]; then
      echo "ERROR: $name did not become healthy within ${TIMEOUT}s"
      exit 1
    fi
    sleep $INTERVAL
    elapsed=$((elapsed + INTERVAL))
  done
  echo "$name is ready."
}

wait_for "Navidrome" "http://localhost:4533/ping"
wait_for "Jellyfin"  "http://localhost:8096/health"
# --insecure is only acceptable here (a Docker readiness check on the host) —
# never in app code or a test assertion. The self-signed nature of this
# server's cert is exactly the thing the toggle tests exercise.
wait_for "Navidrome HTTPS" "https://localhost:4534/ping" "--insecure"

echo "All services ready."
