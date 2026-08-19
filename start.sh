#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"

MODE="${1:-dev}"

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not installed or not in PATH." >&2
  exit 1
fi

if [[ ! -d "$BACKEND_DIR" ]] || [[ ! -d "$FRONTEND_DIR" ]]; then
  echo "Error: expected backend/ and frontend/ directories under $ROOT" >&2
  exit 1
fi

PIDS=()

cleanup() {
  local pid
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
}

trap cleanup EXIT INT TERM

# Free ports 5000 and 3000 if lingering
if command -v fuser >/dev/null 2>&1; then
  fuser -k 5000/tcp 2>/dev/null || true
  fuser -k 3000/tcp 2>/dev/null || true
elif command -v lsof >/dev/null 2>&1; then
  lsof -ti:5000 | xargs kill -9 2>/dev/null || true
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
fi

echo "Starting Comm ($MODE mode)..."
echo "  Backend:  $BACKEND_DIR"
echo "  Frontend: $FRONTEND_DIR"
echo ""

if [[ "$MODE" == "dev" ]]; then
  echo "Backend  -> http://localhost:5000 and network http://0.0.0.0:5000 (npm run start:dev)"
  echo "Frontend -> http://localhost:3000 and network http://0.0.0.0:3000 (npm run dev)"
  echo ""
  (cd "$BACKEND_DIR" && npm run start:dev) &
  PIDS+=("$!")
  (cd "$FRONTEND_DIR" && npm run dev) &
  PIDS+=("$!")
elif [[ "$MODE" == "prod" ]]; then
  SKIP_BUILD=false
  if [[ "${2:-}" == "--skip-build" ]]; then
    SKIP_BUILD=true
  fi

  needs_backend_build=false
  needs_frontend_build=false

  if [[ ! -f "$BACKEND_DIR/dist/src/main.js" ]]; then
    needs_backend_build=true
  fi
  if [[ ! -f "$FRONTEND_DIR/.next/BUILD_ID" ]]; then
    needs_frontend_build=true
  fi

  if [[ "$SKIP_BUILD" == "false" ]] && { [[ "$needs_backend_build" == "true" ]] || [[ "$needs_frontend_build" == "true" ]]; }; then
    if [[ "$needs_backend_build" == "true" ]]; then
      echo "Building backend (dist/ not found)..."
      (cd "$BACKEND_DIR" && npm run build)
    fi
    if [[ "$needs_frontend_build" == "true" ]]; then
      echo "Building frontend (.next production build not found)..."
      (cd "$FRONTEND_DIR" && npm run build)
    fi
    echo ""
  elif [[ "$SKIP_BUILD" == "true" ]]; then
    if [[ "$needs_backend_build" == "true" ]] || [[ "$needs_frontend_build" == "true" ]]; then
      echo "Error: production build missing. Run without --skip-build first." >&2
      exit 1
    fi
  fi

  echo "Backend  -> http://localhost:5000 (npm run start:prod)"
  echo "Frontend -> http://localhost:3000 (npm run start)"
  echo ""
  (cd "$BACKEND_DIR" && npm run start:prod) &
  PIDS+=("$!")
  (cd "$FRONTEND_DIR" && npm run start) &
  PIDS+=("$!")
else
  echo "Usage: $0 [dev|prod] [--skip-build]" >&2
  echo "  dev            - run backend and frontend in development mode (default)" >&2
  echo "  prod           - build if needed, then run production servers" >&2
  echo "  prod --skip-build - run production servers without building" >&2
  exit 1
fi

wait -n
EXIT_CODE=$?
cleanup
exit "$EXIT_CODE"
