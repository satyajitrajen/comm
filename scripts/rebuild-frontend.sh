#!/usr/bin/env bash
# Rebuild and recreate the frontend container so the live UI matches git (Docker).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export BUILD_DATE="${BUILD_DATE:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
echo "Building frontend (BUILD_DATE=$BUILD_DATE)…"
docker compose build --no-cache frontend
echo "Recreating frontend container…"
docker compose up -d --force-recreate frontend
echo "Done. Hard-refresh the browser (Ctrl+Shift+R). UI is only via nginx (80/443), not host :3000."
