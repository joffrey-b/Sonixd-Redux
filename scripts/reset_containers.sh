#!/usr/bin/env bash
# Tears down containers and volumes, and restart the configuration
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
E2E_DIR="$PROJECT_ROOT/e2e"

echo "Generating self-signed TLS certificate (if needed)..."
bash "$E2E_DIR/scripts/setup-tls.sh"

echo "Removing any existing containers and volumes..."
(cd "$E2E_DIR" && docker compose down -v) || true

echo "Starting containers..."
(cd "$E2E_DIR" && docker compose up -d)

echo "Waiting for services to be healthy..."
bash "$E2E_DIR/scripts/wait-for-services.sh"

echo "Running setup scripts..."
bash "$E2E_DIR/scripts/setup-navidrome.sh"
bash "$E2E_DIR/scripts/setup-jellyfin.sh"

echo "Done"
