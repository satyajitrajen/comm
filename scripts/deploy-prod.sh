#!/usr/bin/env bash
# Safe production deploy for this VM's hybrid layout:
#   - Backend: Docker (teamtime-backend)
#   - Frontend: host systemd (teamtime-frontend on :3000)
#   - Edge: host nginx (do NOT stop it)
#   - Data: /var/lib/teamtime/dev.db + /var/lib/teamtime/uploads
#
# Usage (from repo root or scripts/):
#   ./scripts/deploy-prod.sh
#   ./scripts/deploy-prod.sh --skip-pull
#   ./scripts/deploy-prod.sh --skip-migrate
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SKIP_PULL=false
SKIP_MIGRATE=false
for arg in "$@"; do
  case "$arg" in
    --skip-pull) SKIP_PULL=true ;;
    --skip-migrate) SKIP_MIGRATE=true ;;
    -h|--help)
      sed -n '1,20p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $arg" >&2
      exit 1
      ;;
  esac
done

ENV_FILE="$ROOT/backend/.env"
DB_PATH="/var/lib/teamtime/dev.db"
UPLOADS_PATH="/var/lib/teamtime/uploads"
export PATH="${PATH:-/usr/bin}:/home/azureadmin/.nvm/versions/node/v20.20.0/bin"

echo "=== Pre-flight ==="
if [ ! -f "$DB_PATH" ]; then
  echo "ERROR: database missing at $DB_PATH" >&2
  exit 1
fi
if [ ! -d "$UPLOADS_PATH" ]; then
  echo "ERROR: uploads dir missing at $UPLOADS_PATH (refusing deploy — would lose LOCAL files again)" >&2
  exit 1
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: missing $ENV_FILE" >&2
  exit 1
fi
if ! grep -q '/var/lib/teamtime/uploads:/app/uploads' "$ROOT/docker-compose.yml"; then
  echo "ERROR: docker-compose.yml is missing the uploads volume mount. Aborting." >&2
  exit 1
fi

echo "DB:      $DB_PATH ($(du -h "$DB_PATH" | cut -f1))"
echo "Uploads: $UPLOADS_PATH ($(du -sh "$UPLOADS_PATH" | cut -f1))"

if [ "$SKIP_PULL" = false ]; then
  if [ -d "$ROOT/.git" ]; then
    echo "=== git fetch / ff-only ==="
    git fetch origin
    # Prefer fast-forward so we never invent merge commits on the server
    if git rev-parse --verify origin/main >/dev/null 2>&1; then
      git merge --ff-only origin/main
    elif git rev-parse --verify origin/master >/dev/null 2>&1; then
      git merge --ff-only origin/master
    else
      echo "WARN: no origin/main or origin/master — skipping pull"
    fi
  else
    echo "WARN: $ROOT is not a git checkout — skipping pull"
  fi
else
  echo "=== skip pull ==="
fi

# Re-check after pull in case compose was overwritten
if ! grep -q '/var/lib/teamtime/uploads:/app/uploads' "$ROOT/docker-compose.yml"; then
  echo "ERROR: after git pull, uploads volume mount is missing. Fix compose before deploying." >&2
  exit 1
fi

echo "=== Backend: prisma migrate ==="
if [ "$SKIP_MIGRATE" = false ]; then
  (
    cd "$ROOT/backend"
    export DATABASE_URL="${DATABASE_URL:-file:/var/lib/teamtime/dev.db}"
    # Load DATABASE_URL from .env if present
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
    export DATABASE_URL="${DATABASE_URL:-file:/var/lib/teamtime/dev.db}"
    if [ ! -d node_modules ]; then
      npm ci --omit=dev
    fi
    npx prisma generate
    npx prisma migrate deploy
  )
else
  echo "skip migrate"
fi

echo "=== Backend: rebuild + recreate container (uploads volume preserved) ==="
cd "$ROOT"
sudo docker compose build backend
# --no-deps: do not touch frontend/nginx compose services (host nginx stays up)
sudo docker compose up -d --force-recreate --no-deps backend

echo "=== Wait for backend health ==="
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:5000/api/v1/health" >/dev/null 2>&1; then
    echo "Backend healthy."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: backend not healthy" >&2
    sudo docker logs teamtime-backend --tail 80 || true
    exit 1
  fi
  sleep 2
done

echo "=== Frontend: build + restart systemd (host :3000) ==="
(
  cd "$ROOT/frontend"
  npm ci
  npm run build
)
sudo systemctl restart teamtime-frontend
sleep 3
systemctl is-active teamtime-frontend >/dev/null

echo "=== Smoke checks ==="
curl -sf "http://127.0.0.1:5000/api/v1/health" | head -c 200; echo
curl -sf -o /dev/null -w "frontend /login -> %{http_code}\n" "http://127.0.0.1:3000/login"
curl -sk -o /dev/null -w "https /login -> %{http_code}\n" "https://communication.impmeet.com/login" || true

# Confirm uploads still mounted after recreate
MOUNT_OK=$(sudo docker inspect teamtime-backend --format '{{range .Mounts}}{{.Destination}} {{end}}' | grep -c '/app/uploads' || true)
if [ "${MOUNT_OK}" -lt 1 ]; then
  echo "ERROR: /app/uploads is not mounted on backend after deploy" >&2
  exit 1
fi
echo "Uploads mount: OK"
echo "Done. Hard-refresh the browser."
