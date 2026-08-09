#!/usr/bin/env bash
set -euo pipefail
cd /app
npx prisma generate
if [ "${PRISMA_DB_PUSH:-false}" = "true" ]; then
  npx prisma db push
fi
exec node dist/src/main.js
