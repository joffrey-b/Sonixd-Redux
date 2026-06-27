#!/usr/bin/env bash
set -e

CERTS_DIR="$(dirname "$0")/../certs"
mkdir -p "$CERTS_DIR"

if [ -f "$CERTS_DIR/server.crt" ] && [ -f "$CERTS_DIR/server.key" ]; then
  echo "TLS certificate already exists, skipping generation."
  exit 0
fi

echo "Generating self-signed TLS certificate..."
openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout "$CERTS_DIR/server.key" \
  -out   "$CERTS_DIR/server.crt" \
  -days  365 \
  -subj  "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
  2>/dev/null

echo "Certificate generated at $CERTS_DIR/server.crt"
