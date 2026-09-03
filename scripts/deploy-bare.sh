#!/usr/bin/env bash
# Bare-metal deploy: build backend + frontend and restart systemd services.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="${NODE_BIN:-/home/azureadmin/.nvm/versions/node/v20.20.0/bin}"
export PATH="${NODE_BIN}:${PATH}"
NGINX_SRC="${ROOT}/../nginx/conf.d/project.conf"

echo "=== Backend ==="
cd "$ROOT/backend"
npm ci
npm run build
npx prisma generate
npx prisma db push

echo "=== Frontend ==="
cd "$ROOT/frontend"
npm ci
npm run build

echo "=== Restart services ==="
sudo cp "$ROOT/deploy/systemd/teamtime-backend.service" /etc/systemd/system/
sudo cp "$ROOT/deploy/systemd/teamtime-frontend.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl restart teamtime-backend teamtime-frontend
sleep 3
systemctl is-active teamtime-backend teamtime-frontend

echo "=== Sync nginx (bare metal) ==="
if [ -f "$NGINX_SRC" ]; then
  sudo cp "$NGINX_SRC" /etc/nginx/conf.d/project.conf
  sudo nginx -t
  sudo systemctl reload nginx
  systemctl is-active nginx
else
  echo "Skip nginx: $NGINX_SRC not found"
fi

echo "=== Smoke checks ==="
curl -sf -o /dev/null -w "backend :5000 login -> HTTP %{http_code}\n" \
  -X POST http://127.0.0.1:5000/api/v1/auth/login \
  -H "Content-Type: application/json" -d '{"email":"x","password":"y"}' || true
curl -sf -o /dev/null -w "frontend :3000 -> HTTP %{http_code}\n" http://127.0.0.1:3000/ || true

echo "Done. Site: https://communication.impmeet.com (hard-refresh browser)."
