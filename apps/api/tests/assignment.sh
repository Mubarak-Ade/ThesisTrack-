#!/usr/bin/env bash
# Phase 7 test: supervisor assignment lifecycle over HTTP.
#   GET    /projects/:projectId/supervisor  → participants + admin (history visible)
#   POST   …                                → admin, at most one active (409 + DB index)
#   PATCH  …                                → admin, change = END old row + INSERT new row
#   DELETE …                                → admin, soft end (row becomes history)
# Requires a running server and a seeded admin (pnpm seed:admin).
# Tokens are logged in immediately before each request (short-TTL safe).
set -u

cd "$(dirname "$0")/.."   # apps/api
BASE="${BASE:-http://localhost:${PORT:-3001}/api/v1}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@thesistrack.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-AdminPass123!}"
FIXTURES=/tmp/opencode/assignment-fixtures.json

BODY=/tmp/opencode/assignment-body.json
rm -f "$FIXTURES" "$BODY"

if ! curl -sf -o /dev/null -m 3 "$BASE/health" 2>/dev/null; then
  echo "Server is not running on $BASE — start it first (pnpm dev:api)."
  exit 2
fi

echo '— seeding fixtures —'
ADMIN_EMAIL="$ADMIN_EMAIL" FIXTURES_OUT="$FIXTURES" \
  npx tsx src/scripts/seed-assignment-fixtures.ts >/tmp/opencode/assignment-seed.log 2>&1 || {
  echo 'seed failed:'; cat /tmp/opencode/assignment-seed.log; exit 2
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

PW=$(j password); P1=$(j projectId); P2=$(j bareProjectId); P3=$(j completedProjectId)
OA=$(j ownerA); OB=$(j ownerB); OC=$(j ownerC)
S1=$(j super1); S2=$(j super2); S3=$(j super3)
# UUIDs for request bodies and .id assertions; emails are for logins only.
OA_ID=$(j ownerAId); OB_ID=$(j ownerBId); OC_ID=$(j ownerCId)
S1_ID=$(j super1Id); S2_ID=$(j super2Id); S3_ID=$(j super3Id)
ADMIN_ID=$(j adminId)
RANDOM_ID=$(node -pe 'crypto.randomUUID()')

adm() { T=$(login "$ADMIN_EMAIL" "$ADMIN_PASSWORD"); }

echo '== GET: participants + admin see the relationship =='
code=$(req GET "$BASE/projects/$P1/supervisor")
ck 'anonymous → 401' 401 "$code"

adm
code=$(req GET "$BASE/projects/$P1/supervisor" -H "Authorization: Bearer $T")
ck 'admin → 200' 200 "$code"
ck 'active is the seeded super1' "$S1_ID" "$(f data.active.supervisor.id)"
ck 'active carries assignedBy (who assigned)' "$ADMIN_ID" "$(f data.active.assignedBy)"
ck 'history is non-empty (super2 ended)' true "$(f 'data.history.length>=1')"
ck 'history contains the ended super2 row' true "$(f "data.history.some(h=>h.supervisor.id==='$S2_ID'&&h.endedAt!==null)")"
ck 'every history row is ended' true "$(f 'data.history.every(h=>h.endedAt!==null)')"

T=$(login "$OA" "$PW")
code=$(req GET "$BASE/projects/$P1/supervisor" -H "Authorization: Bearer $T")
ck 'owner student → 200' 200 "$code"

T=$(login "$S1" "$PW")
code=$(req GET "$BASE/projects/$P1/supervisor" -H "Authorization: Bearer $T")
ck 'assigned supervisor → 200' 200 "$code"

T=$(login "$OB" "$PW")
code=$(req GET "$BASE/projects/$P1/supervisor" -H "Authorization: Bearer $T")
ck 'unrelated student → 403' 403 "$code"

T=$(login "$S2" "$PW")
code=$(req GET "$BASE/projects/$P1/supervisor" -H "Authorization: Bearer $T")
ck 'ended supervisor (no longer related) → 403' 403 "$code"

adm
code=$(req GET "$BASE/projects/$RANDOM_ID/supervisor" -H "Authorization: Bearer $T")
ck 'unknown project → 404' 404 "$code"
ck '404 carries RESOURCE_NOT_FOUND' 'RESOURCE_NOT_FOUND' "$(f error.code)"
code=$(req GET "$BASE/projects/not-a-uuid/supervisor" -H "Authorization: Bearer $T")
ck 'malformed id → 400 (validate layer)' 400 "$code"

echo '== POST: assign (admin only, one active) =='
T=$(login "$OA" "$PW")
code=$(req POST "$BASE/projects/$P1/supervisor" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d "{\"supervisorId\":\"$S3_ID\"}")
ck 'student → 403' 403 "$code"

T=$(login "$S3" "$PW")
code=$(req POST "$BASE/projects/$P1/supervisor" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d "{\"supervisorId\":\"$S3_ID\"}")
ck 'supervisor → 403' 403 "$code"

code=$(req POST "$BASE/projects/$P2/supervisor" -H 'Content-Type: application/json' \
  -d "{\"supervisorId\":\"$S3_ID\"}")
ck 'anonymous POST → 401' 401 "$code"

# Target validation runs only when the project has no active assignment yet
# (conflict wins otherwise), so these hit the BARE project before we assign it.
adm
code=$(req POST "$BASE/projects/$P2/supervisor" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d "{\"supervisorId\":\"$RANDOM_ID\"}")
ck 'unknown supervisor id → 400' 400 "$code"
ck '400 details path' 'supervisorId' "$(f 'error.details[0].path')"

adm
code=$(req POST "$BASE/projects/$P2/supervisor" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d "{\"supervisorId\":\"$OA_ID\"}")
ck 'target is not a supervisor → 422' 422 "$code"
ck '422 message' 'Target user is not a supervisor' "$(f error.message)"

# Deactivated target → 422 (deactivate S2 via the API, then restore)
T=$(login "$S2" "$PW")
code=$(req GET "$BASE/auth/me" -H "Authorization: Bearer $T"); S2_ID=$(f data.user.id)
adm
code=$(req PATCH "$BASE/users/$S2_ID" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d '{"isActive":false}')
ck 'deactivate super2 setup → 200' 200 "$code"

adm
code=$(req POST "$BASE/projects/$P2/supervisor" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d "{\"supervisorId\":\"$S2_ID\"}")
ck 'deactivated target → 422' 422 "$code"
ck '422 message' 'Cannot assign a deactivated supervisor' "$(f error.message)"

adm
code=$(req PATCH "$BASE/users/$S2_ID" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d '{"isActive":true}')
ck 'reactivate super2 → 200' 200 "$code"

adm
code=$(req POST "$BASE/projects/$P2/supervisor" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d '{}')
ck 'missing supervisorId → 400' 400 "$code"

adm
code=$(req POST "$BASE/projects/$P1/supervisor" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d "{\"supervisorId\":\"$S3_ID\"}")
ck 'POST while active exists → 409' 409 "$code"
ck '409 message' 'This student already has an active supervisor' "$(f error.message)"

adm
code=$(req POST "$BASE/projects/$P2/supervisor" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d "{\"supervisorId\":\"$S3_ID\"}")
ck 'assign bare project → 201' 201 "$code"
ck 'response supervisor is super3' "$S3_ID" "$(f data.assignment.supervisor.id)"
ck 'active assignment is primary' true "$(f data.assignment.isPrimary)"
ck 'assignedBy is the acting admin' "$ADMIN_ID" "$(f data.assignment.assignedBy)"

adm
code=$(req GET "$BASE/projects/$P2/supervisor" -H "Authorization: Bearer $T")
ck 'GET sees the new active assignment' "$S3_ID" "$(f data.active.supervisor.id)"

adm
code=$(req POST "$BASE/projects/$P2/supervisor" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d "{\"supervisorId\":\"$S1_ID\"}")
ck 'POST when already assigned → 409' 409 "$code"

adm
code=$(req POST "$BASE/projects/$P3/supervisor" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d "{\"supervisorId\":\"$S1_ID\"}")
ck 'completed project → 422' 422 "$code"
ck '422 message' 'Cannot assign a supervisor to a completed project' "$(f error.message)"

adm
code=$(req POST "$BASE/projects/$RANDOM_ID/supervisor" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d "{\"supervisorId\":\"$S1_ID\"}")
ck 'unknown project → 404' 404 "$code"

echo '== PATCH: change = end old row + insert new row =='
T=$(login "$OA" "$PW")
code=$(req PATCH "$BASE/projects/$P1/supervisor" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d "{\"supervisorId\":\"$S2_ID\"}")
ck 'student → 403' 403 "$code"

adm
code=$(req PATCH "$BASE/projects/$P1/supervisor" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d "{\"supervisorId\":\"$S1_ID\"}")
ck 'change to the SAME supervisor → 409' 409 "$code"
ck '409 message' 'This supervisor already supervises this student' "$(f error.message)"

adm
code=$(req PATCH "$BASE/projects/$P1/supervisor" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d "{\"supervisorId\":\"$S2_ID\"}")
ck 'change (rehire past supervisor) → 200' 200 "$code"
ck 'new active is super2' "$S2_ID" "$(f data.assignment.supervisor.id)"
ck 'new row assignedBy admin' "$ADMIN_ID" "$(f data.assignment.assignedBy)"

adm
code=$(req GET "$BASE/projects/$P1/supervisor" -H "Authorization: Bearer $T")
ck 'active switched to super2' "$S2_ID" "$(f data.active.supervisor.id)"
ck 'history now contains ended super1' true "$(f "data.history.some(h=>h.supervisor.id==='$S1_ID'&&h.endedAt!==null)")"

adm
code=$(req PATCH "$BASE/projects/$P1/supervisor" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d "{\"supervisorId\":\"$S1_ID\"}")
ck 'change back (undo, rehire super1) → 200' 200 "$code"
ck 'active is super1 again' "$S1_ID" "$(f data.assignment.supervisor.id)"

adm
code=$(req PATCH "$BASE/projects/$P1/supervisor" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d "{\"supervisorId\":\"$OB_ID\"}")
ck 'change to non-supervisor → 422' 422 "$code"

adm
code=$(req PATCH "$BASE/projects/$RANDOM_ID/supervisor" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d "{\"supervisorId\":\"$S2_ID\"}")
ck 'unknown project → 404' 404 "$code"

echo '== DELETE: soft end (row survives as history) =='
T=$(login "$OC" "$PW")
code=$(req DELETE "$BASE/projects/$P1/supervisor" -H "Authorization: Bearer $T")
ck 'unrelated student → 403' 403 "$code"

adm
code=$(req DELETE "$BASE/projects/$P1/supervisor" -H "Authorization: Bearer $T")
ck 'end active assignment → 200' 200 "$code"
ck 'endedAt is set (soft end)' true "$(f 'data.assignment.endedAt!==null')"
ck 'ended row keeps its supervisor' "$S1_ID" "$(f data.assignment.supervisor.id)"

adm
code=$(req GET "$BASE/projects/$P1/supervisor" -H "Authorization: Bearer $T")
ck 'project now unassigned' 'null' "$(f data.active)"
ck 'history survived the end' true "$(f 'data.history.length>=1')"

adm
code=$(req DELETE "$BASE/projects/$P1/supervisor" -H "Authorization: Bearer $T")
ck 'end with no active → 409' 409 "$code"
ck '409 message' 'This student has no active supervisor assignment to end' "$(f error.message)"

adm
code=$(req PATCH "$BASE/projects/$P1/supervisor" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d "{\"supervisorId\":\"$S2_ID\"}")
ck 'change with no active → 409' 409 "$code"
ck '409 message' 'This student has no active supervisor assignment to change' "$(f error.message)"

adm
code=$(req POST "$BASE/projects/$P1/supervisor" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d "{\"supervisorId\":\"$S2_ID\"}")
ck 'assign again after end (rehire via POST) → 201' 201 "$code"
ck 'rehired supervisor is super2' "$S2_ID" "$(f data.assignment.supervisor.id)"

# ── I13: a supervisor may hold MANY students; a student holds exactly one ──
# ownerA already holds S2 at this point. Each case below is one the plan calls
# out: an implementation keyed on supervisor_id would refuse these with a false
# 409, and a second ACTIVE row for a single student must still be refused.
echo '== I13 cardinality asymmetry (§6.2 corollary) =='

# The earlier sections leave ownerB assigned to S3. Reset first so every case
# below starts from a known state. The assertion is on the resulting state, not
# on the reset, so this stays setup — if B were already bare the DELETE 409s
# and the check still passes.
adm
req DELETE "$BASE/students/$OB_ID/supervisor" -H "Authorization: Bearer $T" >/dev/null
code=$(req GET "$BASE/students/$OB_ID/supervisor" -H "Authorization: Bearer $T")
ck 'setup: B unassigned, its ended row kept as history' 'null' "$(f data.active)"

# ownerA holds S2 here — the "already has a student" half of the rule.
adm
code=$(req POST "$BASE/students/$OB_ID/supervisor" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d "{\"supervisorId\":\"$S2_ID\"}")
ck 'POST /students/B/supervisor while A already has S → 201' 201 "$code"

T=$(login "$S2" "$PW")
code=$(req GET "$BASE/supervisors/me/students" -H "Authorization: Bearer $T")
ck 'GET /supervisors/me/students → 200' 200 "$code"
ck 'caseload: one row per student → 2 rows for 2 students' 2 "$(f data.students.length)"
ck 'caseload holds exactly A and B' "$OA|$OB" "$(f 'data.students.map(s=>s.student.email).sort().join("|")')"

adm
code=$(req DELETE "$BASE/students/$OB_ID/supervisor" -H "Authorization: Bearer $T")
ck 'end B → 200 (the row stays as history)' 200 "$code"

adm
code=$(req POST "$BASE/projects/$P2/supervisor" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d "{\"supervisorId\":\"$S2_ID\"}")
ck 'POST /projects/B/supervisor while A already has S → 201, not 409' 201 "$code"

# An ENDED row must not block reassignment either — the unique index is partial
# (WHERE ended_at IS NULL), so history never consumes the one allowed slot.
adm
code=$(req POST "$BASE/students/$OC_ID/supervisor" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d "{\"supervisorId\":\"$S3_ID\"}")
ck 'assign C fresh → 201' 201 "$code"

adm
code=$(req DELETE "$BASE/students/$OC_ID/supervisor" -H "Authorization: Bearer $T")
ck 'end C → 200' 200 "$code"

adm
code=$(req POST "$BASE/students/$OC_ID/supervisor" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d "{\"supervisorId\":\"$S3_ID\"}")
ck 'student with an ENDED row may be assigned again → 201' 201 "$code"

# The other half of the rule: still at most ONE active row per student, even
# when the incoming supervisor is someone new.
adm
code=$(req POST "$BASE/projects/$P2/supervisor" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d "{\"supervisorId\":\"$S3_ID\"}")
ck 'second ACTIVE row for one student → 409' 409 "$code"
ck '409 message' 'This student already has an active supervisor' "$(f error.message)"

echo
echo "==================================="
echo "  PASS: $PASS   FAIL: $FAIL"
if [ "$FAIL" -gt 0 ]; then printf '  Failed: %s\n' "${FAILED[@]}"; fi
echo "==================================="
[ "$FAIL" -eq 0 ]
