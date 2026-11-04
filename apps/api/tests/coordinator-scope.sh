#!/usr/bin/env bash
# System test: department-scoped coordinator, over pure HTTP (design
# 2026-11-02, ADR-17). Requires a running server and the seeded admin.
#
# Creates two departments and one coordinator per department *through the API*
# (no coordinator seed — §15.3), then proves the scope end-to-end:
#
#   users         own-department lists, cross-department detail 404, foreign
#                 filter 403, coordinator/administrator provisioning 403
#   assignments   own-department 201, foreign student/supervisor 404
#   proposals     own start-review + review 200, foreign proposal 404
#   workflows     foreign detail 404, own duplicate 201 + source archived,
#                 restore 403, department/default edits 403, DELETE 403
#   transfer      super admin moves a student with a matching new number 200,
#                 a mismatched number 422, and the scopes follow the move
#
# Every email/registration number carries a timestamp + random suffix so
# re-runs never collide. Nothing is cleaned up (test database only).
set -u

cd "$(dirname "$0")/.."   # apps/api
BASE="${BASE:-http://localhost:${PORT:-3001}/api/v1}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@thesistrack.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-AdminPass123!}"
BODY=/tmp/opencode/coord-body.json
STAMP="$(date +%s)-$RANDOM"
SHARED_PASS='CoordSuite123!'

rm -f "$BODY"

if ! curl -sf -o /dev/null -m 3 "$BASE/health" 2>/dev/null; then
  echo "Server is not running on $BASE — start it first (pnpm dev:api)."
  exit 2
fi

req() { # METHOD URL [curl-args...] → echoes status; body lands in $BODY
  local method="$1" url="$2"; shift 2
  curl -s -o "$BODY" -w '%{http_code}' -X "$method" "$url" "$@"
}

f() { # dotted path into the last response body
  node -pe "const d=JSON.parse(require('fs').readFileSync('$BODY','utf8')); const v=(()=>{try{return d.$1}catch(e){return undefined}})(); v===undefined?'undefined':v" 2>/dev/null || echo 'undefined'
}

PASS=0; FAIL=0; FAILED=()
ck() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); printf '  PASS  %s\n' "$1"; else FAIL=$((FAIL+1)); FAILED+=("$1"); printf '  FAIL  %s (expected [%s] got [%s])\n' "$1" "$2" "$3"; fi }

codeFor() { node -pe "Array.from({length:4},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random()*24)]).join('')"; }
regFor() { node -pe 'String(Math.floor(Math.random()*100000)).padStart(5,"0")'; }
CA=$(codeFor); CB=$(codeFor)
# A code collision with much older suite residue is possible but vanishingly
# rare (4 letters); retry once with a fresh code if the create says 409.
createDept() { # name-suffix code → echoes id
  req POST "$BASE/departments" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
    -d "{\"name\":\"Coord $1 $STAMP\",\"code\":\"$2\"}" >/dev/null
  f data.department.id
}

alogin() {
  req POST "$BASE/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" >/dev/null
  AT=$(f data.accessToken)
}

tok() { # email → access token (shared suite password)
  req POST "$BASE/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$SHARED_PASS\"}" >/dev/null
  f data.accessToken
}

# provision <actor-token> <first> <last> <email> <role> [extra-json] → "id|activationToken"
provision() {
  local token="$1" first="$2" last="$3" email="$4" role="$5" extra="${6:-}"
  req POST "$BASE/users" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
    -d "{\"firstName\":\"$first\",\"lastName\":\"$last\",\"email\":\"$email\",\"role\":\"$role\"${extra}}" >/dev/null
  printf '%s|%s' "$(f data.user.id)" "$(f data.activationToken)"
}

activate() { # activation-token
  req POST "$BASE/auth/activate" -H 'Content-Type: application/json' \
    -d "{\"token\":\"$1\",\"password\":\"$SHARED_PASS\"}" >/dev/null
}

echo '== Setup: two departments + one coordinator each (created via the API) =='

alogin
DEP_A=$(createDept A "$CA")
DEP_B=$(createDept B "$CB")
ck 'department A created' 1 "$([ -n "$DEP_A" ] && [ "$DEP_A" != undefined ] && echo 1 || echo 0)"
ck 'department B created' 1 "$([ -n "$DEP_B" ] && [ "$DEP_B" != undefined ] && echo 1 || echo 0)"
ck 'department codes differ' 1 "$([ "$CA" != "$CB" ] && echo 1 || echo 0)"

read -r COORD_A_ID COORD_A_ACT <<<"$(provision "$AT" Cora A "coord-a-$STAMP@thesistrack.test" coordinator ",\"departmentId\":\"$DEP_A\"" | tr '|' ' ')"
read -r COORD_B_ID COORD_B_ACT <<<"$(provision "$AT" Cory B "coord-b-$STAMP@thesistrack.test" coordinator ",\"departmentId\":\"$DEP_B\"" | tr '|' ' ')"
activate "$COORD_A_ACT"
activate "$COORD_B_ACT"
CTA=$(tok "coord-a-$STAMP@thesistrack.test")
CTB=$(tok "coord-b-$STAMP@thesistrack.test")
ck 'both coordinators provisioned and activated' 1 \
  "$([ "${#COORD_A_ID}" = 36 ] && [ "${#COORD_B_ID}" = 36 ] && [ -n "$CTA" ] && [ -n "$CTB" ] && echo 1 || echo 0)"

# Students/supervisors are created BY the coordinators, with no departmentId:
# the server must force their own department (design §12.1).
read -r STU_A_ID STU_A_ACT <<<"$(provision "$CTA" Stu A "stu-a-$STAMP@thesistrack.test" student ",\"registrationNumber\":\"CST/23/$CA/$(regFor)\"" | tr '|' ' ')"
read -r SUP_A_ID SUP_A_ACT <<<"$(provision "$CTA" Sue A "sup-a-$STAMP@thesistrack.test" supervisor '' | tr '|' ' ')"
read -r STU_B_ID STU_B_ACT <<<"$(provision "$CTB" Stu B "stu-b-$STAMP@thesistrack.test" student ",\"registrationNumber\":\"CST/23/$CB/$(regFor)\"" | tr '|' ' ')"
read -r SUP_B_ID SUP_B_ACT <<<"$(provision "$CTB" Sam B "sup-b-$STAMP@thesistrack.test" supervisor '' | tr '|' ' ')"
activate "$STU_A_ACT"; activate "$SUP_A_ACT"; activate "$STU_B_ACT"; activate "$SUP_B_ACT"
STU_A_TOK=$(tok "stu-a-$STAMP@thesistrack.test")
STU_B_TOK=$(tok "stu-b-$STAMP@thesistrack.test")
ck 'students and supervisors provisioned by their coordinator' 1 \
  "$([ "${#STU_A_ID}" = 36 ] && [ "${#SUP_A_ID}" = 36 ] && [ "${#STU_B_ID}" = 36 ] && [ "${#SUP_B_ID}" = 36 ] && echo 1 || echo 0)"

alogin
code=$(req GET "$BASE/users/$STU_A_ID" -H "Authorization: Bearer $AT")
ck 'coordinator-forced student belongs to department A' "$DEP_A" "$(f data.user.department.id)"
code=$(req GET "$BASE/users/$STU_B_ID" -H "Authorization: Bearer $AT")
ck 'coordinator-forced student belongs to department B' "$DEP_B" "$(f data.user.department.id)"

echo
echo '== Users: reads and provisioning stay inside the coordinator department =='

code=$(req GET "$BASE/users?role=supervisor&limit=100" -H "Authorization: Bearer $CTA")
ck 'coordinator A lists supervisors → 200' 200 "$code"
ck 'own supervisor visible' "$SUP_A_ID" "$(f "data.users.find(u=>u.id==='$SUP_A_ID').id")"
ck 'foreign supervisor hidden' 'undefined' "$(f "data.users.find(u=>u.id==='$SUP_B_ID')")"

code=$(req GET "$BASE/users?role=student&limit=100&departmentId=$DEP_A" -H "Authorization: Bearer $CTA")
ck 'coordinator A lists own-department students → 200' 200 "$code"
ck 'own student visible' "$STU_A_ID" "$(f "data.users.find(u=>u.id==='$STU_A_ID').id")"

code=$(req GET "$BASE/users/$STU_B_ID" -H "Authorization: Bearer $CTA")
ck 'cross-department user detail → 404' 404 "$code"
ck '404 carries RESOURCE_NOT_FOUND' 'RESOURCE_NOT_FOUND' "$(f error.code)"

code=$(req GET "$BASE/users?departmentId=$DEP_B" -H "Authorization: Bearer $CTA")
ck 'cross-department list filter → 403' 403 "$code"
ck '403 carries AUTHORIZATION_ERROR' 'AUTHORIZATION_ERROR' "$(f error.code)"

code=$(req POST "$BASE/users" -H "Authorization: Bearer $CTA" -H 'Content-Type: application/json' \
  -d "{\"firstName\":\"No\",\"lastName\":\"Coord\",\"email\":\"nope-coord-$STAMP@thesistrack.test\",\"role\":\"coordinator\",\"departmentId\":\"$DEP_A\"}")
ck 'coordinator creating a coordinator → 403' 403 "$code"

code=$(req POST "$BASE/users" -H "Authorization: Bearer $CTA" -H 'Content-Type: application/json' \
  -d "{\"firstName\":\"No\",\"lastName\":\"Admin\",\"email\":\"nope-admin-$STAMP@thesistrack.test\",\"role\":\"administrator\"}")
ck 'coordinator creating an administrator → 403' 403 "$code"

echo
echo '== Assignments: both sides must be in the coordinator department =='

code=$(req POST "$BASE/students/$STU_A_ID/supervisor" -H "Authorization: Bearer $CTA" -H 'Content-Type: application/json' \
  -d "{\"supervisorId\":\"$SUP_B_ID\"}")
ck 'foreign supervisor → 404' 404 "$code"

code=$(req POST "$BASE/students/$STU_B_ID/supervisor" -H "Authorization: Bearer $CTA" -H 'Content-Type: application/json' \
  -d "{\"supervisorId\":\"$SUP_A_ID\"}")
ck 'foreign student → 404' 404 "$code"

code=$(req POST "$BASE/students/$STU_A_ID/supervisor" -H "Authorization: Bearer $CTA" -H 'Content-Type: application/json' \
  -d "{\"supervisorId\":\"$SUP_A_ID\"}")
ck 'own student + own supervisor → 201' 201 "$code"
ck 'assignment points at the own supervisor' "$SUP_A_ID" "$(f data.assignment.supervisor.id)"

echo
echo '== Proposals: review scope, own 200 and foreign 404 =='

code=$(req POST "$BASE/proposals" -H "Authorization: Bearer $STU_A_TOK" -H 'Content-Type: application/json' \
  -d "{\"title\":\"Coord A proposal $STAMP\",\"abstract\":\"Scope.\",\"body\":\"<p>Body.</p>\"}")
ck 'student A creates a proposal → 201' 201 "$code"
PROP_A=$(f data.proposal.id)
code=$(req POST "$BASE/proposals/$PROP_A/submit" -H "Authorization: Bearer $STU_A_TOK")
ck 'student A submits → 201' 201 "$code"
code=$(req POST "$BASE/proposals/$PROP_A/start-review" -H "Authorization: Bearer $CTA")
ck 'coordinator A starts review in its department → 200' 200 "$code"
code=$(req POST "$BASE/proposals/$PROP_A/review" -H "Authorization: Bearer $CTA" -H 'Content-Type: application/json' \
  -d '{"decision":"revision_required","comment":"Scope suite revision."}')
ck 'coordinator A reviews in its department → 200' 200 "$code"

code=$(req POST "$BASE/proposals" -H "Authorization: Bearer $STU_B_TOK" -H 'Content-Type: application/json' \
  -d "{\"title\":\"Coord B proposal $STAMP\",\"abstract\":\"Scope.\",\"body\":\"<p>Body.</p>\"}")
ck 'student B creates a proposal → 201' 201 "$code"
PROP_B=$(f data.proposal.id)
code=$(req POST "$BASE/proposals/$PROP_B/submit" -H "Authorization: Bearer $STU_B_TOK")
ck 'student B submits → 201' 201 "$code"
code=$(req POST "$BASE/proposals/$PROP_B/start-review" -H "Authorization: Bearer $CTA")
ck 'coordinator A reviewing a foreign proposal → 404' 404 "$code"

echo
echo '== Workflows: own duplicate + archive, foreign/default edits refused =='

alogin
code=$(req POST "$BASE/workflows" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Coord WF A $STAMP\",\"departmentId\":\"$DEP_A\",\"stages\":[{\"name\":\"Proposal\",\"requiresApproval\":true},{\"name\":\"Defence\"}]}")
ck 'workflow A created by the super admin → 201' 201 "$code"
WF_A=$(f data.workflow.id)
code=$(req POST "$BASE/workflows" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Coord WF B $STAMP\",\"departmentId\":\"$DEP_B\",\"stages\":[{\"name\":\"Proposal\",\"requiresApproval\":true}]}")
ck 'workflow B created by the super admin → 201' 201 "$code"
WF_B=$(f data.workflow.id)

code=$(req GET "$BASE/workflows/$WF_B" -H "Authorization: Bearer $CTA")
ck 'foreign workflow detail → 404' 404 "$code"

code=$(req POST "$BASE/workflows/$WF_A/duplicate" -H "Authorization: Bearer $CTA" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Coord WF A v2 $STAMP\"}")
ck 'own workflow duplicate → 201' 201 "$code"
WF_A2=$(f data.workflow.id)
ck 'source archived in the duplicate response' "$WF_A" "$(f data.archivedWorkflowId)"
ck 'new version keeps the coordinator department' "$DEP_A" "$(f data.workflow.departmentId)"

code=$(req PATCH "$BASE/workflows/$WF_A" -H "Authorization: Bearer $CTA" -H 'Content-Type: application/json' \
  -d '{"archived":false}')
ck 'coordinator restoring an archived workflow → 403' 403 "$code"

code=$(req PATCH "$BASE/workflows/$WF_A2" -H "Authorization: Bearer $CTA" -H 'Content-Type: application/json' \
  -d "{\"departmentId\":\"$DEP_B\"}")
ck 'coordinator moving a workflow department → 403' 403 "$code"

code=$(req PATCH "$BASE/workflows/$WF_A2" -H "Authorization: Bearer $CTA" -H 'Content-Type: application/json' \
  -d '{"isDefault":true}')
ck 'coordinator claiming the default flag → 403' 403 "$code"

code=$(req DELETE "$BASE/workflows/$WF_A2" -H "Authorization: Bearer $CTA")
ck 'coordinator hard-deleting a workflow → 403 (super-admin only)' 403 "$code"

echo
echo '== Transfer: only the super admin moves an account, with a matching number =='

alogin
code=$(req PATCH "$BASE/users/$STU_A_ID" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d "{\"departmentId\":\"$DEP_B\"}")
ck 'transfer without a new registration number → 422' 422 "$code"
ck '422 carries BUSINESS_RULE_VIOLATION' 'BUSINESS_RULE_VIOLATION' "$(f error.code)"

NEW_REG="CST/23/$CB/$(regFor)"
code=$(req PATCH "$BASE/users/$STU_A_ID" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d "{\"departmentId\":\"$DEP_B\",\"registrationNumber\":\"$NEW_REG\"}")
ck 'transfer with a department-B number → 200' 200 "$code"
ck 'moved student now belongs to department B' "$DEP_B" "$(f data.user.department.id)"
ck 'moved student keeps the new registration number' "$NEW_REG" "$(f data.user.registrationNumber)"

code=$(req GET "$BASE/users/$STU_A_ID" -H "Authorization: Bearer $CTA")
ck 'old department coordinator can no longer read the moved student (404)' 404 "$code"
code=$(req GET "$BASE/users/$STU_A_ID" -H "Authorization: Bearer $CTB")
ck 'new department coordinator can read the moved student (200)' 200 "$code"

echo
echo "==================================="
echo "  PASS: $PASS   FAIL: $FAIL"
if [ "$FAIL" -gt 0 ]; then printf '  Failed: %s\n' "${FAILED[@]}"; fi
echo "==================================="
[ "$FAIL" -eq 0 ]
