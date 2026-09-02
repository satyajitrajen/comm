#!/usr/bin/env bash
# Stop Docker stack if it was started (frees ports 80/443/5000 for bare metal).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if command -v docker >/dev/null 2>&1; then
  sudo docker compose down 2>/dev/null || true
  sudo docker stop teamtime teamtime-backend teamtime-frontend 2>/dev/null || true
  echo "Docker stack stopped."
else
  echo "Docker not installed; nothing to stop."
fi
