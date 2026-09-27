#!/usr/bin/env bash
# Phase 6 user-management test: admin directory end-to-end.
#   list/search/filter/paginate · detail · patch (incl. activate/deactivate
#   guardrails) · resend invitation · all-or-nothing bulk import
# Requires a running server (ACCESS_TOKEN_TTL=3 recommended) and seeded admin.
set -u

cd "$(dirname "$0")/.."   # apps/api
BASE="${BASE:-http://localhost:${PORT:-3001}/api/v1}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@thesistrack.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-AdminPass123!}"
STAMP=$(date +%s)
STUDENT_EMAIL="umgmt-student-$STAMP@test.local"
PATCH_EMAIL="umgmt-patch-$STAMP@test.local"
IMPORT_1="umgmt-import1-$STAMP@test.local"
IMPORT_2="umgmt-import2-$STAMP@test.local"
NEW_PASS='UmgmtPass123!'

JAR_STUDENT=/tmp/opencode/tt-umgmt-student.txt
BODY=/tmp/opencode/tt-umgmt-body.json
rm -f "$JAR_STUDENT" "$BODY"

if ! curl -sf -o /dev/null -m 3 "$BASE/health" 2>/dev/null; then
  echo "Server is not running on $BASE — start it first (ACCESS_TOKEN_TTL=3 npx tsx src/server.ts)."
  exit 2
fi

PASS=0; FAIL=0; FAILED=()

req() { local method="$1" url="$2"; shift 2; curl -s -o "$BODY" -w '%{http_code}' -X "$method" "$url" "$@"; }

f() { node -pe "const d=JSON.parse(require('fs').readFileSync('$BODY','utf8')); const v=(()=>{try{return d.$1}catch(e){return 'undefined'}})(); v===undefined?'undefined':v" 2>/dev/null || echo 'undefined'; }

ck() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); printf '  PASS  %s\n' "$1"; else FAIL=$((FAIL+1)); FAILED+=("$1"); printf '  FAIL  %s (expected [%s] got [%s])\n' "$1" "$2" "$3"; fi }

login() { # email password [jar] → token
  if [ -n "${3:-}" ]; then
    req POST "$BASE/auth/login" -c "$3" -H 'Content-Type: application/json' \
      -d "{\"email\":\"$1\",\"password\":\"$2\"}" >/dev/null
  else
    req POST "$BASE/auth/login" -H 'Content-Type: application/json' \
      -d "{\"email\":\"$1\",\"password\":\"$2\"}" >/dev/null
  fi
  f data.accessToken
}

# Admin access tokens are 3s TTL — always fetch a fresh one per request.
adm() { login "$ADMIN_EMAIL" "$ADMIN_PASSWORD"; }

RANDOM_UUID() { node -pe 'crypto.randomUUID()'; }

echo '== 0. Fixtures: create + activate a student, create an INVITED user =='
T=$(adm)
code=$(req POST "$BASE/users" -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  -d "{\"firstName\":\"Umgmt\",\"lastName\":\"Student\",\"email\":\"$STUDENT_EMAIL\",\"role\":\"student\"}")
ck 'provision student → 201' 201 "$code"
ST_TOKEN=$(f data.activationToken)

code=$(req POST "$BASE/auth/activate" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$ST_TOKEN\",\"password\":\"$NEW_PASS\"}")
ck 'student activates' 200 "$code"
ST_ID=$(f data.user.id)
ST_STATUS=$(f data.user.status)
ck 'activated user reports ACTIVE' 'ACTIVE' "$ST_STATUS"

T=$(adm)
code=$(req POST "$BASE/users" -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  -d "{\"firstName\":\"Patch\",\"lastName\":\"Target\",\"email\":\"$PATCH_EMAIL\",\"role\":\"student\"}")
ck 'provision patch target → 201' 201 "$code"
PATCH_ID=$(f data.user.id)
PATCH_TOKEN=$(f data.activationToken)

echo '== 1. GET /users: list, search, filter, paginate =='
ST=$(login "$STUDENT_EMAIL" "$NEW_PASS")
code=$(req GET "$BASE/users" -H "Authorization: Bearer $ST");                 ck 'anonymous-style: student → 403' 403 "$code"
code=$(req GET "$BASE/users");                                                ck 'no token → 401' 401 "$code"

T=$(adm)
code=$(req GET "$BASE/users" -H "Authorization: Bearer $T");                  ck 'admin list → 200' 200 "$code"
TOTAL=$(f data.pagination.total)
ck 'total ≥ 1' 1 "$([ "$TOTAL" -ge 1 ] 2>/dev/null && echo 1 || echo 0)"
ck 'page echoes default' '1' "$(f data.pagination.page)"

T=$(adm)
code=$(req GET "$BASE/users?q=$STUDENT_EMAIL" -H "Authorization: Bearer $T")
ck 'q matches exactly the student' 1 "$(f data.users.length)"
ck 'q hit is the right email' "$STUDENT_EMAIL" "$(f data.users[0].email)"

T=$(adm)
code=$(req GET "$BASE/users?q=zzz-no-such-user-$STAMP" -H "Authorization: Bearer $T")
ck 'q with no match → empty list' '0' "$(f data.users.length)"
ck 'q no-match total 0' '0' "$(f data.pagination.total)"

T=$(adm)
code=$(req GET "$BASE/users?role=administrator" -H "Authorization: Bearer $T")
ck 'role filter: all administrators' 'true' "$(f "data.users.every(u=>u.role==='administrator')")"

T=$(adm)
code=$(req GET "$BASE/users?isActive=false" -H "Authorization: Bearer $T")
ck 'isActive=false: all inactive' 'true' "$(f 'data.users.every(u=>u.isActive===false)')"

T=$(adm)
code=$(req GET "$BASE/users?limit=1" -H "Authorization: Bearer $T")
ck 'limit=1 returns 1 row' '1' "$(f data.users.length)"
ck 'limit echoes' '1' "$(f data.pagination.limit)"

T=$(adm)
code=$(req GET "$BASE/users?page=0" -H "Authorization: Bearer $T");            ck 'page=0 → 400' 400 "$code"
T=$(adm)
code=$(req GET "$BASE/users?isActive=maybe" -H "Authorization: Bearer $T");   ck 'bad isActive → 400' 400 "$code"

echo '== 2. GET /users/:userId: detail =='
T=$(adm)
code=$(req GET "$BASE/users/$ST_ID" -H "Authorization: Bearer $T");           ck 'detail student → 200' 200 "$code"
ck 'detail email matches' "$STUDENT_EMAIL" "$(f data.user.email)"
ck 'detail exposes status' 'ACTIVE' "$(f data.user.status)"
ck 'never exposes passwordHash' 'undefined' "$(f data.user.passwordHash)"

MISSING=$(RANDOM_UUID)
T=$(adm)
code=$(req GET "$BASE/users/$MISSING" -H "Authorization: Bearer $T");         ck 'unknown user → 404' 404 "$code"
ck '404 code' 'RESOURCE_NOT_FOUND' "$(f error.code)"
ck '404 message' 'User not found' "$(f error.message)"

T=$(adm)
code=$(req GET "$BASE/users/not-a-uuid" -H "Authorization: Bearer $T");       ck 'malformed id → 400' 400 "$code"
ST=$(login "$STUDENT_EMAIL" "$NEW_PASS")
code=$(req GET "$BASE/users/$ST_ID" -H "Authorization: Bearer $ST");          ck 'student detail → 403' 403 "$code"

echo '== 3. PATCH /users/:userId: edits, activate/deactivate guardrails =='
ST=$(login "$STUDENT_EMAIL" "$NEW_PASS")
code=$(req PATCH "$BASE/users/$ST_ID" -H "Authorization: Bearer $ST" \
  -H 'Content-Type: application/json' -d '{"firstName":"Nope"}')
ck 'student patch → 403' 403 "$code"

T=$(adm)
code=$(req PATCH "$BASE/users/$PATCH_ID" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' \
  -d '{"firstName":"Renamed","registrationNumber":"REG-001"}')
ck 'admin patch → 200' 200 "$code"
ck 'firstName updated' 'Renamed' "$(f data.user.firstName)"
ck 'registrationNumber set' 'REG-001' "$(f data.user.registrationNumber)"
ck 'still INVITED' 'INVITED' "$(f data.user.status)"

T=$(adm)
code=$(req PATCH "$BASE/users/$PATCH_ID" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d '{}')
ck 'empty patch → 400' 400 "$code"
ck 'empty patch message' 'At least one field is required' "$(f 'error.details[0].message')"

T=$(adm)
code=$(req PATCH "$BASE/users/$PATCH_ID" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d '{"email":"changed@test.local"}')
ck 'email-only patch → 400 (not patchable)' 400 "$code"

T=$(adm)
code=$(req PATCH "$BASE/users/$PATCH_ID" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d '{"isActive":true}')
ck 'activating never-activated account → 422' 422 "$code"
ck '422 code' 'BUSINESS_RULE_VIOLATION' "$(f error.code)"

# — self-deactivation & last-admin guards (against the real admin; must not mutate) —
T=$(adm)
code=$(req GET "$BASE/auth/me" -H "Authorization: Bearer $T");                ck 'admin /me → 200' 200 "$code"
ADMIN_ID=$(f data.user.id)

T=$(adm)
code=$(req PATCH "$BASE/users/$ADMIN_ID" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d '{"isActive":false}')
ck 'self-deactivation → 403' 403 "$code"
ck 'self-deactivation message' 'You cannot deactivate your own account' "$(f error.message)"

# The last-admin guard is a GLOBAL invariant (only one active admin in the
# whole DB). Its 409 branch is only reachable when exactly one exists — and
# then the guard itself blocks the mutation, so it is always safe to assert.
# With several admins present we assert the allowed path instead (never
# mutating the real admin account the suites depend on).
T=$(adm)
code=$(req GET "$BASE/users?role=administrator&isActive=true" -H "Authorization: Bearer $T")
ADM_COUNT=$(f data.pagination.total)

if [ "$ADM_COUNT" -eq 1 ]; then
  T=$(adm)
  code=$(req PATCH "$BASE/users/$ADMIN_ID" -H "Authorization: Bearer $T" \
    -H 'Content-Type: application/json' -d '{"role":"student"}')
  ck 'demoting the last admin → 409' 409 "$code"
  ck 'last-admin message' 'Cannot demote or deactivate the last active administrator' "$(f error.message)"
else
  echo "  NOTE  $ADM_COUNT active administrators present — the 409 branch needs a single-admin DB;"
  echo "        asserting that the allowed path (demote with peers present) works instead (see below)."
fi

T=$(adm)
code=$(req GET "$BASE/auth/me" -H "Authorization: Bearer $T")
ck 'admin untouched after guards' 'administrator' "$(f data.user.role)"
ck 'admin still active' 'true' "$(f data.user.isActive)"

# — deactivation revokes sessions, reactivation restores access —
S_JAR=/tmp/opencode/tt-umgmt-jar.txt; rm -f "$S_JAR"
login "$STUDENT_EMAIL" "$NEW_PASS" "$S_JAR" >/dev/null
ST_RT=$(awk '$6=="tt_refresh"{print $7}' "$S_JAR")
ck 'student session established' 1 "$([ -n "$ST_RT" ] && echo 1 || echo 0)"

T=$(adm)
code=$(req PATCH "$BASE/users/$ST_ID" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d '{"isActive":false}')
ck 'deactivate student → 200' 200 "$code"
ck 'reports DEACTIVATED' 'DEACTIVATED' "$(f data.user.status)"
ck 'isActive now false' 'false' "$(f data.user.isActive)"

code=$(req POST "$BASE/auth/refresh" -H "Cookie: tt_refresh=$ST_RT")
ck 'deactivated: refresh rejected (sessions revoked)' 401 "$code"
code=$(req POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$STUDENT_EMAIL\",\"password\":\"$NEW_PASS\"}")
ck 'deactivated: login rejected' 401 "$code"

T=$(adm)
code=$(req PATCH "$BASE/users/$ST_ID" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d '{"isActive":true}')
ck 'reactivate → 200' 200 "$code"
ck 'reports ACTIVE again' 'ACTIVE' "$(f data.user.status)"
code=$(req POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$STUDENT_EMAIL\",\"password\":\"$NEW_PASS\"}")
ck 'reactivated: login works' 200 "$code"

# — role change: promote (allowed) then demote (allowed while another admin exists) —
T=$(adm)
code=$(req PATCH "$BASE/users/$ST_ID" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d '{"role":"administrator"}')
ck 'promote student → administrator' 'administrator' "$(f data.user.role)"
T=$(adm)
code=$(req PATCH "$BASE/users/$ST_ID" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d '{"role":"student"}')
ck 'demote with another admin present → 200' 200 "$code"
ck 'back to student' 'student' "$(f data.user.role)"

T=$(adm)
code=$(req PATCH "$BASE/users/$MISSING" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d '{"firstName":"Ghost"}')
ck 'patch unknown user → 404' 404 "$code"
T=$(adm)
code=$(req PATCH "$BASE/users/not-a-uuid" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d '{"firstName":"Ghost"}')
ck 'patch malformed id → 400' 400 "$code"

echo '== 4. POST /users/:userId/invite: resend invitation =='
ST=$(login "$STUDENT_EMAIL" "$NEW_PASS")
code=$(req POST "$BASE/users/$PATCH_ID/invite" -H "Authorization: Bearer $ST")
ck 'student invite → 403' 403 "$code"

T=$(adm)
code=$(req POST "$BASE/users/$PATCH_ID/invite" -H "Authorization: Bearer $T")
ck 'resend invitation → 200' 200 "$code"
INVITE_TOKEN=$(f data.activationToken)
ck 'token returned (non-prod)' 1 "$([ -n "$INVITE_TOKEN" ] && [ "$INVITE_TOKEN" != 'undefined' ] && echo 1 || echo 0)"
ck 'token rotated by resend' 1 "$([ -n "$INVITE_TOKEN" ] && [ "$INVITE_TOKEN" != "$PATCH_TOKEN" ] && echo 1 || echo 0)"
ck 'invitee status INVITED' 'INVITED' "$(f data.user.status)"

T=$(adm)
code=$(req POST "$BASE/users/$ST_ID/invite" -H "Authorization: Bearer $T")
ck 'invite an ACTIVE account → 409' 409 "$code"
ck '409 message' 'Account is already active' "$(f error.message)"

T=$(adm)
code=$(req POST "$BASE/users/$MISSING/invite" -H "Authorization: Bearer $T")
ck 'invite unknown user → 404' 404 "$code"
T=$(adm)
code=$(req POST "$BASE/users/not-a-uuid/invite" -H "Authorization: Bearer $T")
ck 'invite malformed id → 400' 400 "$code"

# The resent token must actually work end-to-end
code=$(req POST "$BASE/auth/activate" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$INVITE_TOKEN\",\"password\":\"$NEW_PASS\"}")
ck 'resent invitation activates' 200 "$code"
code=$(req POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$PATCH_EMAIL\",\"password\":\"$NEW_PASS\"}")
ck 'invited user can sign in' 200 "$code"

echo '== 5. POST /users/import: all-or-nothing bulk provisioning =='
ST=$(login "$STUDENT_EMAIL" "$NEW_PASS")
code=$(req POST "$BASE/users/import" -H "Authorization: Bearer $ST" \
  -H 'Content-Type: application/json' -d '{"users":[]}')
ck 'student import → 403' 403 "$code"

IMPORT_BODY=/tmp/opencode/tt-umgmt-import.json
cat > "$IMPORT_BODY" <<JSON
{"users":[
  {"firstName":"Imp","lastName":"One","email":"$IMPORT_1","role":"student"},
  {"firstName":"Imp","lastName":"Two","email":"$IMPORT_2","role":"supervisor"}
]}
JSON
T=$(adm)
code=$(req POST "$BASE/users/import" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d @"$IMPORT_BODY")
ck 'valid batch → 201' 201 "$code"
ck 'created count 2' '2' "$(f data.created)"
ck 'both INVITED' 'true' "$(f "data.users.every(u=>u.status==='INVITED')")"
ck 'invitations issued' '2' "$(f data.invitations.length)"
IMP_TOKEN=$(f data.invitations[0].activationToken)
ck 'activation token present' 1 "$([ -n "$IMP_TOKEN" ] && [ "$IMP_TOKEN" != 'undefined' ] && echo 1 || echo 0)"

# Existing email (even an INVITED one) blocks the whole batch — and nothing is inserted
STALE_EMAIL="umgmt-stale-$STAMP@test.local"
CONFLICT_BODY=/tmp/opencode/tt-umgmt-conflict.json
cat > "$CONFLICT_BODY" <<JSON
{"users":[
  {"firstName":"Fresh","lastName":"Row","email":"$STALE_EMAIL","role":"student"},
  {"firstName":"Dup","lastName":"Row","email":"$IMPORT_1","role":"student"}
]}
JSON
T=$(adm)
code=$(req POST "$BASE/users/import" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d @"$CONFLICT_BODY")
ck 'existing email → 422' 422 "$code"
ck '422 code' 'BUSINESS_RULE_VIOLATION' "$(f error.code)"
ck 'points at the offending row' 'users.1.email' "$(f 'error.details[0].path')"
ck 'row message' 'An account with this email already exists' "$(f 'error.details[0].message')"
T=$(adm)
code=$(req GET "$BASE/users?q=$STALE_EMAIL" -H "Authorization: Bearer $T")
ck 'all-or-nothing: nothing inserted' '0' "$(f data.users.length)"

DUP_EMAIL="umgmt-dup-$STAMP@test.local"
T=$(adm)
code=$(req POST "$BASE/users/import" -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  -d "{\"users\":[{\"firstName\":\"A\",\"lastName\":\"B\",\"email\":\"$DUP_EMAIL\"},{\"firstName\":\"C\",\"lastName\":\"D\",\"email\":\"$DUP_EMAIL\"}]}")
ck 'duplicate within batch → 422' 422 "$code"
ck 'duplicate message' 'Duplicate email in this batch' "$(f 'error.details[0].message')"

T=$(adm)
code=$(req POST "$BASE/users/import" -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  -d '{"users":[{"firstName":"Good","lastName":"Row","email":"umgmt-good-'$STAMP'@test.local"},{"firstName":"Bad","email":"not-an-email"}]}')
ck 'row shape error → 400' 400 "$code"
ck 'shape error code' 'VALIDATION_ERROR' "$(f error.code)"
ck 'names every bad row' 'true' "$(f "error.details.some(d=>d.path==='users.1.email')")"
ck 'missing lastName flagged' 'true' "$(f "error.details.some(d=>d.path==='users.1.lastName')")"

T=$(adm)
code=$(req POST "$BASE/users/import" -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  -d '{"users":[]}')
ck 'empty batch → 400' 400 "$code"

node -pe "JSON.stringify({users:Array.from({length:501},(_,i)=>({firstName:'Bulk',lastName:'Row',email:'umgmt-bulk-'+i+'-$STAMP@test.local',role:'student'}))})" > "$IMPORT_BODY"
T=$(adm)
code=$(req POST "$BASE/users/import" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d @"$IMPORT_BODY")
ck 'over 500 rows → 400' 400 "$code"

# Imported account activates and signs in with its issued token
code=$(req POST "$BASE/auth/activate" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$IMP_TOKEN\",\"password\":\"$NEW_PASS\"}")
ck 'imported user activates' 200 "$code"
code=$(req POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$IMPORT_1\",\"password\":\"$NEW_PASS\"}")
ck 'imported user signs in' 200 "$code"

echo
echo "==================================="
echo "  PASS: $PASS   FAIL: $FAIL"
if [ "$FAIL" -gt 0 ]; then printf '  Failed: %s\n' "${FAILED[@]}"; fi
echo "==================================="
[ "$FAIL" -eq 0 ]
