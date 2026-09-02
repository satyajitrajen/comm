#!/usr/bin/env bash
# Production deploy via Docker Compose (nginx + backend + frontend).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/backend/.env"
DB_PATH="/var/lib/teamtime/dev.db"

if [ ! -f "$DB_PATH" ]; then
  echo "ERROR: Production database not found at $DB_PATH"
  echo "Create or copy the SQLite file before Docker cutover."
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: Missing $ENV_FILE (JWT_SECRET, CORS_ORIGIN, DATABASE_URL required)."
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

export DATABASE_URL="${DATABASE_URL:-file:/var/lib/teamtime/dev.db}"
export THROTTLE_TTL_MS="${THROTTLE_TTL_MS:-60000}"
export THROTTLE_LIMIT="${THROTTLE_LIMIT:-600}"
export CORS_ORIGIN="${CORS_ORIGIN:-https://communication.impmeet.com}"
export BUILD_DATE="${BUILD_DATE:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"

echo "=== Pre-flight ==="
echo "Database: $DB_PATH ($(du -h "$DB_PATH" | cut -f1))"
echo "DATABASE_URL=$DATABASE_URL"

echo "=== Stop any existing Docker stack ==="
"$ROOT/scripts/stop-docker-stack.sh"

echo "=== Stop bare-metal services (release SQLite lock + ports) ==="
sudo systemctl stop teamtime-backend teamtime-frontend nginx 2>/dev/null || true

echo "=== Ensure Docker network ==="
if ! sudo docker network inspect teamtime-net >/dev/null 2>&1; then
  sudo docker network create teamtime-net
fi

echo "=== Build and start compose ==="
cd "$ROOT"
sudo -E docker compose build --pull
sudo -E docker compose up -d

echo "=== Wait for backend health ==="
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:5000/api/v1/health" >/dev/null 2>&1; then
    echo "Backend healthy."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: Backend did not become healthy in time."
    sudo docker compose ps
    sudo docker logs teamtime-backend --tail 80 || true
    exit 1
  fi
  sleep 2
done

echo "=== Smoke checks ==="
curl -sf -o /dev/null -w "login probe -> HTTP %{http_code}\n" \
  -X POST http://127.0.0.1:5000/api/v1/auth/login \
  -H "Content-Type: application/json" -d '{"email":"x","password":"y"}' || true
curl -sf -o /dev/null -w "frontend via nginx -> HTTP %{http_code}\n" \
  -k https://127.0.0.1/ -H "Host: communication.impmeet.com" || true

sudo docker compose ps
echo "Done. Site: https://communication.impmeet.com (hard-refresh browser)."
