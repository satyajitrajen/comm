#!/usr/bin/env bash
# Import users into the live (or any) Communication API via POST /api/v1/admin/users/import.
#
# Prereqs: bash, curl, python3
#
# 1) Log in to the app as OWNER or ADMIN → DevTools → Application → localStorage → veloce_token
#    (or use your auth flow to obtain an access JWT).
#
# 2) Prepare CSV with header including: email, displayName, password (password ≥ 8 chars).
#    Optional columns: phoneNumber, role, department
#
# 3) Run:
#    export IMPORT_USERS_TOKEN='eyJ...'
#    ./scripts/import-users-live.sh ./users.csv
#
# Optional: override API origin (must match nginx / your deployment):
#    export COMMUNICATION_API_BASE='https://communication.impmeet.com'
#
set -euo pipefail

BASE="${COMMUNICATION_API_BASE:-https://communication.impmeet.com}"
TOKEN="${IMPORT_USERS_TOKEN:?Set IMPORT_USERS_TOKEN to your admin access JWT (see script header).}"
CSV_FILE="${1:?Usage: $0 path/to/users.csv}"

if [[ ! -f "$CSV_FILE" ]]; then
  echo "File not found: $CSV_FILE" >&2
  exit 1
fi

payload="$(python3 -c "import json,sys; print(json.dumps({'csv': open(sys.argv[1], encoding='utf-8').read()}))" "$CSV_FILE")"

curl -sS -X POST "${BASE}/api/v1/admin/users/import" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$payload" | python3 -m json.tool

echo >&2
echo "Done. Check created / skipped / errors above." >&2
