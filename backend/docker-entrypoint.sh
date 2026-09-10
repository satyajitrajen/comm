#!/usr/bin/env bash
set -euo pipefail
cd /app
npx prisma generate
# Always apply committed migrations. `db push` is a dev tool and must never
# run against a production database (it can drop columns/data on drift).
npx prisma migrate deploy
exec node dist/src/main.js
