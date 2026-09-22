#!/usr/bin/env bash
# Phase 5 RBAC test: the authorization matrix over HTTP.
# Requires a running server and a seeded admin (pnpm seed:admin).
# Tokens are logged in immediately before each request so the suite works
# with any ACCESS_TOKEN_TTL (including the short TTL used by auth-flow.sh).
set -u

cd "$(dirname "$0")/.."   # apps/api
BASE="${BASE:-http://localhost:${PORT:-3001}/api/v1}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@thesistrack.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-AdminPass123!}"
FIXTURES=/tmp/opencode/rbac-fixtures.json

BODY=/tmp/opencode/rbac-body.json
rm -f "$FIXTURES" "$BODY"

if ! curl -sf -o /dev/null -m 3 "$BASE/health" 2>/dev/null; then
  echo "Server is not running on $BASE — start it first (pnpm dev:api)."
  exit 2
fi

echo '— seeding fixtures —'
FIXTURES_OUT="$FIXTURES" npx tsx src/scripts/seed-rbac-fixtures.ts >/tmp/opencode/rbac-seed.log 2>&1 || {
  echo 'seed failed:'; cat /tmp/opencode/rbac-seed.log; exit 2
}

j() { node -pe "JSON.parse(require('fs').readFileSync('$FIXTURES','utf8')).$1"; }
f() { node -pe "const d=JSON.parse(require('fs').readFileSync('$BODY','utf8')); const v=(()=>{try{return d.$1}catch(e){return undefined}})(); v===undefined?'undefined':v" 2>/dev/null || echo 'undefined'; }

req() { local method="$1" url="$2"; shift 2; curl -s -o "$BODY" -w '%{http_code}' -X "$method" "$url" "$@"; }

login() { # email password → token
  req POST "$BASE/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" >/dev/null
  f data.accessToken
}

PASS=0; FAIL=0; FAILED=()
ck() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); printf '  PASS  %s\n' "$1"; else FAIL=$((FAIL+1)); FAILED+=("$1"); printf '  FAIL  %s (expected [%s] got [%s])\n' "$1" "$2" "$3"; fi }

PW=$(j password); PROJECT=$(j projectId)
OWN=$(j owner); OTH=$(j other); SUP=$(j superAssigned); OUT=$(j superOutsider); END=$(j superEnded)

echo '== Authentication layer (first) =='
code=$(req GET "$BASE/projects/$PROJECT");                       ck 'anonymous → 401' 401 "$code"

echo '== Resource authorization matrix: GET /projects/:projectId =='
T=$(login "$OWN" "$PW")
code=$(req GET "$BASE/projects/$PROJECT" -H "Authorization: Bearer $T")
ck 'owner student → 200' 200 "$code"
ck 'owner sees own project' "$PROJECT" "$(f data.project.id)"

T=$(login "$OTH" "$PW")
code=$(req GET "$BASE/projects/$PROJECT" -H "Authorization: Bearer $T")
ck 'other student → 403' 403 "$code"
ck '403 carries AUTHORIZATION_ERROR' 'AUTHORIZATION_ERROR' "$(f error.code)"

T=$(login "$SUP" "$PW")
code=$(req GET "$BASE/projects/$PROJECT" -H "Authorization: Bearer $T");    ck 'assigned supervisor → 200' 200 "$code"

T=$(login "$OUT" "$PW")
code=$(req GET "$BASE/projects/$PROJECT" -H "Authorization: Bearer $T");    ck 'outsider supervisor → 403' 403 "$code"

T=$(login "$END" "$PW")
code=$(req GET "$BASE/projects/$PROJECT" -H "Authorization: Bearer $T");    ck 'ended assignment → 403' 403 "$code"

T=$(login "$ADMIN_EMAIL" "$ADMIN_PASSWORD")
code=$(req GET "$BASE/projects/$PROJECT" -H "Authorization: Bearer $T");    ck 'admin → 200' 200 "$code"

echo '== Not-found semantics (objective 404, never masked) =='
RANDOM_ID=$(node -pe 'crypto.randomUUID()')
code=$(req GET "$BASE/projects/$RANDOM_ID" -H "Authorization: Bearer $T"); ck 'unknown project → 404 (admin too)' 404 "$code"
ck '404 code' 'RESOURCE_NOT_FOUND' "$(f error.code)"

T=$(login "$OWN" "$PW")
code=$(req GET "$BASE/projects/not-a-uuid" -H "Authorization: Bearer $T"); ck 'malformed id → 400 (validate layer)' 400 "$code"

echo '== RBAC layer: POST /users (administrator only) =='
TMP_EMAIL="rbac-admin-probe-$(date +%s)@test.local"
body="{\"firstName\":\"P\",\"lastName\":\"Probe\",\"email\":\"$TMP_EMAIL\",\"role\":\"student\"}"

T=$(login "$OTH" "$PW")
code=$(req POST "$BASE/users" -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d "$body")
ck 'student → 403' 403 "$code"

T=$(login "$SUP" "$PW")
code=$(req POST "$BASE/users" -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d "$body")
ck 'supervisor → 403' 403 "$code"

T=$(login "$ADMIN_EMAIL" "$ADMIN_PASSWORD")
code=$(req POST "$BASE/users" -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d "$body")
ck 'admin → 201' 201 "$code"

echo
echo "==================================="
echo "  PASS: $PASS   FAIL: $FAIL"
if [ "$FAIL" -gt 0 ]; then printf '  Failed: %s\n' "${FAILED[@]}"; fi
echo "==================================="
[ "$FAIL" -eq 0 ]
