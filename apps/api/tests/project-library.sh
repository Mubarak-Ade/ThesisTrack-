#!/usr/bin/env bash
# System test: institution-wide project library, over pure HTTP (design
# 2026-11-05, ADR-18). Requires a running server and the seeded admin.
#
# Builds the corpus the way production does — supervisor assigned, proposal
# submitted, review approved (approval is what materialises the project and
# links `proposals.project_id`) — then proves the read model end to end:
#
#   access        supervisor/coordinator/admin 200, student 403, anonymous 401
#   search        title token, approved body token, unapproved text absent,
#                 one-character query, status and department filters + facet
#   projection    whitelisted rows only, no email/body/attachment keys
#   detail        similar projects exclude the source; foreign coordinator 200
#   similarity    advisory check honours excludeProjectId
#   proposal      supervisor 200, owner 403, foreign coordinator 404
#   scope         coordinator still 404 on a foreign project workspace,
#                 including a write, while the library detail is 200
#
# Every email/registration number carries a timestamp + random suffix so
# re-runs never collide. Nothing is cleaned up (test database only).
set -u

cd "$(dirname "$0")/.."   # apps/api
BASE="${BASE:-http://localhost:${PORT:-3001}/api/v1}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@thesistrack.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-AdminPass123!}"
BODY=/tmp/opencode/project-library-body.json
STAMP="$(date +%s)-$RANDOM"
SHARED_PASS='LibSuite123!'

# Full-text tokens are alphanumeric on purpose: a hyphen/digit stamp can be
# split into several lexemes and would make an exact-match assertion flaky.
SUITE_TOKEN="libsuite$(date +%s)$RANDOM"
TITLE_A_TOKEN="libtitlea$(date +%s)$RANDOM"
BODY_A_TOKEN="libbodya$(date +%s)$RANDOM"
# Deliberately a word with no shared stamp digits: a fuzzy match against the
# suite token would otherwise be a false positive, not corpus leakage.
UNAPPROVED_TOKEN="xylophonically"

rm -f "$BODY"
mkdir -p "$(dirname "$BODY")"

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

j() { # arbitrary JS over the last response body (bound as `d`, i.e. `{data}`)
  node -pe "const d=JSON.parse(require('fs').readFileSync('$BODY','utf8')); const v=(()=>{try{return $1}catch(e){return undefined}})(); v===undefined?'undefined':v" 2>/dev/null || echo 'undefined'
}

forbiddenKeys() { # recursive key scan of $BODY → comma-separated hits
  node -e '
    const fs = require("fs");
    const body = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const forbidden = new Set([
      "attachment", "body", "email", "feedback", "milestone",
      "passwordHash", "proposalId", "registrationNumber", "review", "submission",
    ]);
    const found = new Set();
    const walk = (value) => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          if (forbidden.has(key)) found.add(key);
          walk(child);
        }
      }
    };
    walk(body);
    process.stdout.write([...found].sort().join(","));
  ' "$BODY"
}

PASS=0; FAIL=0; FAILED=()
ck() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); printf '  PASS  %s\n' "$1"; else FAIL=$((FAIL+1)); FAILED+=("$1"); printf '  FAIL  %s (expected [%s] got [%s])\n' "$1" "$2" "$3"; fi }

codeFor() { node -pe "Array.from({length:4},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random()*24)]).join('')"; }
regFor() { node -pe 'String(Math.floor(Math.random()*100000)).padStart(5,"0")'; }

createDept() { # name-suffix code → echoes id
  req POST "$BASE/departments" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
    -d "{\"name\":\"Library $1 $STAMP\",\"code\":\"$2\"}" >/dev/null
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

assign() { # student-id supervisor-id → status
  req POST "$BASE/students/$1/supervisor" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
    -d "{\"supervisorId\":\"$2\"}"
}

echo '== Setup: two departments, coordinators, supervisors and students =='

alogin
ck 'seeded admin can log in' 1 "$([ -n "$AT" ] && [ "$AT" != undefined ] && echo 1 || echo 0)"

CA=$(codeFor); CB=$(codeFor)
DEP_A=$(createDept A "$CA")
DEP_B=$(createDept B "$CB")
ck 'department A created' 1 "$([ "${#DEP_A}" = 36 ] && echo 1 || echo 0)"
ck 'department B created' 1 "$([ "${#DEP_B}" = 36 ] && echo 1 || echo 0)"

read -r COORD_A_ID COORD_A_ACT <<<"$(provision "$AT" Cora A "lib-coord-a-$STAMP@thesistrack.test" coordinator ",\"departmentId\":\"$DEP_A\"" | tr '|' ' ')"
read -r COORD_B_ID COORD_B_ACT <<<"$(provision "$AT" Cory B "lib-coord-b-$STAMP@thesistrack.test" coordinator ",\"departmentId\":\"$DEP_B\"" | tr '|' ' ')"
read -r SUP_A_ID SUP_A_ACT <<<"$(provision "$AT" Sue A "lib-sup-a-$STAMP@thesistrack.test" supervisor ",\"departmentId\":\"$DEP_A\"" | tr '|' ' ')"
read -r SUP_B_ID SUP_B_ACT <<<"$(provision "$AT" Sam B "lib-sup-b-$STAMP@thesistrack.test" supervisor ",\"departmentId\":\"$DEP_B\"" | tr '|' ' ')"
read -r STU_A_ID STU_A_ACT <<<"$(provision "$AT" Stu A "lib-stu-a-$STAMP@thesistrack.test" student ",\"departmentId\":\"$DEP_A\",\"registrationNumber\":\"LIB/26/$CA/$(regFor)\"" | tr '|' ' ')"
read -r STU_B_ID STU_B_ACT <<<"$(provision "$AT" Stu B "lib-stu-b-$STAMP@thesistrack.test" student ",\"departmentId\":\"$DEP_B\",\"registrationNumber\":\"LIB/26/$CB/$(regFor)\"" | tr '|' ' ')"
read -r STU_C_ID STU_C_ACT <<<"$(provision "$AT" Stu C "lib-stu-c-$STAMP@thesistrack.test" student ",\"departmentId\":\"$DEP_B\",\"registrationNumber\":\"LIB/26/$CB/$(regFor)\"" | tr '|' ' ')"

for act in "$COORD_A_ACT" "$COORD_B_ACT" "$SUP_A_ACT" "$SUP_B_ACT" "$STU_A_ACT" "$STU_B_ACT" "$STU_C_ACT"; do
  activate "$act"
done
CTA=$(tok "lib-coord-a-$STAMP@thesistrack.test")
CTB=$(tok "lib-coord-b-$STAMP@thesistrack.test")
STA=$(tok "lib-sup-a-$STAMP@thesistrack.test")
STB=$(tok "lib-sup-b-$STAMP@thesistrack.test")
STU_A_TOK=$(tok "lib-stu-a-$STAMP@thesistrack.test")
STU_B_TOK=$(tok "lib-stu-b-$STAMP@thesistrack.test")
STU_C_TOK=$(tok "lib-stu-c-$STAMP@thesistrack.test")
ck 'coordinators, supervisors and students provisioned and activated' 1 \
  "$([ -n "$CTA" ] && [ -n "$CTB" ] && [ -n "$STA" ] && [ -n "$STB" ] && [ -n "$STU_A_TOK" ] && [ -n "$STU_B_TOK" ] && [ -n "$STU_C_TOK" ] && echo 1 || echo 0)"

ck 'supervisor A assigned to student A' 201 "$(assign "$STU_A_ID" "$SUP_A_ID")"
ck 'supervisor B assigned to student B' 201 "$(assign "$STU_B_ID" "$SUP_B_ID")"
ck 'supervisor B assigned to student C' 201 "$(assign "$STU_C_ID" "$SUP_B_ID")"

echo
echo '== Flow: approved proposals materialise the library corpus =='

# Project A — the archived, body-token project.
code=$(req POST "$BASE/proposals" -H "Authorization: Bearer $STU_A_TOK" -H 'Content-Type: application/json' \
  -d "{\"title\":\"Photovoltaic scheduling ledger for campus energy $TITLE_A_TOKEN $SUITE_TOKEN\",\"abstract\":\"Solar generation scheduling for the campus microgrid.\",\"body\":\"<p>The system stores demand in a <strong>$BODY_A_TOKEN</strong> ledger for R&amp;D.</p>\"}")
ck 'student A creates proposal A → 201' 201 "$code"
PROP_A=$(f data.proposal.id)
ck 'student A submits proposal A → 201' 201 \
  "$(req POST "$BASE/proposals/$PROP_A/submit" -H "Authorization: Bearer $STU_A_TOK")"
ck 'supervisor A starts review → 200' 200 \
  "$(req POST "$BASE/proposals/$PROP_A/start-review" -H "Authorization: Bearer $STA")"
code=$(req POST "$BASE/proposals/$PROP_A/review" -H "Authorization: Bearer $STA" -H 'Content-Type: application/json' \
  -d '{"decision":"approved"}')
ck 'supervisor A approves proposal A → 200' 200 "$code"
PROJ_A=$(f data.project.id)
ck 'approval materialised project A' 1 "$([ "${#PROJ_A}" = 36 ] && echo 1 || echo 0)"

# Project B — shares the suite token and the ledger vocabulary with A.
code=$(req POST "$BASE/proposals" -H "Authorization: Bearer $STU_B_TOK" -H 'Content-Type: application/json' \
  -d "{\"title\":\"Campus solar generation ledger and load matching $SUITE_TOKEN\",\"abstract\":\"Schedules photovoltaic output against building demand with a shared ledger.\",\"body\":\"<p>Load matching for the campus microgrid.</p>\"}")
ck 'student B creates proposal B → 201' 201 "$code"
PROP_B=$(f data.proposal.id)
ck 'student B submits proposal B → 201' 201 \
  "$(req POST "$BASE/proposals/$PROP_B/submit" -H "Authorization: Bearer $STU_B_TOK")"
ck 'supervisor B starts review → 200' 200 \
  "$(req POST "$BASE/proposals/$PROP_B/start-review" -H "Authorization: Bearer $STB")"
code=$(req POST "$BASE/proposals/$PROP_B/review" -H "Authorization: Bearer $STB" -H 'Content-Type: application/json' \
  -d '{"decision":"approved"}')
ck 'supervisor B approves proposal B → 200' 200 "$code"
PROJ_B=$(f data.project.id)
ck 'approval materialised project B' 1 "$([ "${#PROJ_B}" = 36 ] && echo 1 || echo 0)"

# A submitted-but-never-approved proposal: its text must stay out of the corpus.
code=$(req POST "$BASE/proposals" -H "Authorization: Bearer $STU_C_TOK" -H 'Content-Type: application/json' \
  -d "{\"title\":\"Unapproved microplastic survey $SUITE_TOKEN\",\"abstract\":\"Only an unapproved proposal mentions $UNAPPROVED_TOKEN.\",\"body\":\"<p>Draft.</p>\"}")
ck 'student C creates proposal C → 201' 201 "$code"
PROP_C=$(f data.proposal.id)
ck 'student C submits proposal C → 201' 201 \
  "$(req POST "$BASE/proposals/$PROP_C/submit" -H "Authorization: Bearer $STU_C_TOK")"

# Archived projects stay searchable (ADR-18 includes them on purpose).
code=$(req PATCH "$BASE/projects/$PROJ_A" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d '{"status":"archived"}')
ck 'admin archives project A → 200' 200 "$code"

echo
echo '== Access matrix =='

LIB="$BASE/project-library"
code=$(req GET "$LIB?q=$SUITE_TOKEN&limit=50" -H "Authorization: Bearer $STA")
ck 'supervisor reads the library → 200' 200 "$code"
ck 'supervisor sees both departments' 2 "$(f "data.projects.length")"

code=$(req GET "$LIB?q=$SUITE_TOKEN&limit=50" -H "Authorization: Bearer $CTA")
ck 'coordinator reads the library → 200' 200 "$code"
ck 'coordinator sees both departments (ADR-18 exception)' 2 "$(f "data.projects.length")"

code=$(req GET "$LIB?q=$SUITE_TOKEN&limit=50" -H "Authorization: Bearer $AT")
ck 'super admin reads the library → 200' 200 "$code"

ck 'student → 403' 403 "$(req GET "$LIB" -H "Authorization: Bearer $STU_A_TOK")"
ck 'anonymous → 401' 401 "$(req GET "$LIB")"

echo
echo '== Search, filters and facet =='

code=$(req GET "$LIB?q=$TITLE_A_TOKEN&limit=50" -H "Authorization: Bearer $AT")
ck 'title token search → 200' 200 "$code"
ck 'title token finds project A' "$PROJ_A" "$(f "data.projects[0].id")"
ck 'numeric score present for a text search' 1 "$(j "typeof d.data.projects[0].score==='number'?1:0")"
ck 'excerpt present for a text search' 1 "$(j "typeof d.data.projects[0].excerpt==='string'&&d.data.projects[0].excerpt.length>0?1:0")"

code=$(req GET "$LIB?q=$BODY_A_TOKEN&limit=50" -H "Authorization: Bearer $AT")
ck 'approved-proposal body token search → 200' 200 "$code"
ck 'body token finds project A' "$PROJ_A" "$(f "data.projects[0].id")"

code=$(req GET "$LIB?q=$UNAPPROVED_TOKEN&limit=50" -H "Authorization: Bearer $AT")
ck 'unapproved proposal text is absent' 0 "$(f "data.projects.length")"

code=$(req GET "$LIB?q=p&limit=50" -H "Authorization: Bearer $AT")
ck 'one-character query → 200' 200 "$code"
ck 'one-character query does not scan' 0 "$(f "data.pagination.total")"

code=$(req GET "$LIB?q=$SUITE_TOKEN&status=archived&limit=50" -H "Authorization: Bearer $AT")
ck 'archived filter → 200' 200 "$code"
ck 'archived filter returns only project A' "$PROJ_A" "$(f "data.projects[0].id")"
ck 'archived filter narrows to one row' 1 "$(f "data.projects.length")"

code=$(req GET "$LIB?q=$SUITE_TOKEN&departmentId=$DEP_B&limit=50" -H "Authorization: Bearer $AT")
ck 'department filter → 200' 200 "$code"
ck 'department B filter returns project B' "$PROJ_B" "$(f "data.projects[0].id")"
ck 'department B filter excludes project A' 'undefined' "$(f "data.projects.find(p=>p.id==='$PROJ_A')")"

code=$(req GET "$LIB?q=$SUITE_TOKEN&limit=50" -H "Authorization: Bearer $AT")
ck 'department facet lists department A with one project' 1 "$(f "data.departments.find(d=>d.id==='$DEP_A').count")"
ck 'department facet lists department B with one project' 1 "$(f "data.departments.find(d=>d.id==='$DEP_B').count")"

echo
echo '== Projection and redaction =='

code=$(req GET "$LIB?q=$SUITE_TOKEN&limit=50" -H "Authorization: Bearer $AT")
ck 'list read → 200' 200 "$code"
ck 'list contains no forbidden key' '' "$(forbiddenKeys)"

code=$(req GET "$LIB/$PROJ_A" -H "Authorization: Bearer $AT")
ck 'detail read → 200' 200 "$code"
ck 'detail contains no forbidden key' '' "$(forbiddenKeys)"
ck 'detail carries student name' 'Stu' "$(f "data.project.student.firstName")"
ck 'detail carries supervisor hydration' "$SUP_A_ID" "$(f "data.project.supervisors[0].id")"
ck 'detail carries the session field (null is honest)' 1 "$(f "data.project.session===null||typeof data.project.session==='string'?1:0")"

echo
echo '== Detail similarity and the advisory check =='

code=$(req GET "$LIB/$PROJ_A" -H "Authorization: Bearer $CTB")
ck 'foreign coordinator reads a library detail → 200' 200 "$code"
ck 'similar list excludes the source project' 'undefined' "$(f "data.similar.find(p=>p.id==='$PROJ_A')")"
ck 'similar list includes project B' "$PROJ_B" "$(f "data.similar.find(p=>p.id==='$PROJ_B').id")"

BASE_CHECK="{\"title\":\"Photovoltaic scheduling ledger for campus energy\",\"description\":\"Matches solar generation to campus load with a shared ledger.\"}"
code=$(req POST "$LIB/similarity-check" -H "Authorization: Bearer $STA" -H 'Content-Type: application/json' \
  -d "$BASE_CHECK")
ck 'similarity check → 200' 200 "$code"
ck 'similarity check is advisory and returns matches' 1 "$(f "data.matches.length>0?1:0")"

code=$(req POST "$LIB/similarity-check" -H "Authorization: Bearer $STA" -H 'Content-Type: application/json' \
  -d "{\"title\":\"Photovoltaic scheduling ledger for campus energy\",\"description\":\"Matches solar generation to campus load with a shared ledger.\",\"excludeProjectId\":\"$PROJ_A\"}")
ck 'similarity check honours excludeProjectId' 200 "$code"
ck 'excluded project is absent' 'undefined' "$(f "data.matches.find(p=>p.id==='$PROJ_A')")"

ck 'similarity check validates a blank title → 400' 400 \
  "$(req POST "$LIB/similarity-check" -H "Authorization: Bearer $STA" -H 'Content-Type: application/json' -d '{"title":"   ","description":"x"}')"

echo
echo '== Proposal similarity: reviewer access only =='

SIM="$BASE/proposals/$PROP_A/similar-projects"
code=$(req GET "$SIM" -H "Authorization: Bearer $STA")
ck 'assigned supervisor reads similar projects → 200' 200 "$code"
ck 'proposal similarity excludes its own approved project' 'undefined' "$(f "data.matches.find(p=>p.id==='$PROJ_A')")"
ck 'proposal similarity includes project B' "$PROJ_B" "$(f "data.matches.find(p=>p.id==='$PROJ_B').id")"

ck 'coordinator in the proposal department → 200' 200 "$(req GET "$SIM" -H "Authorization: Bearer $CTA")"
ck 'owner (student) → 403' 403 "$(req GET "$SIM" -H "Authorization: Bearer $STU_A_TOK")"
ck 'foreign coordinator → 404' 404 "$(req GET "$SIM" -H "Authorization: Bearer $CTB")"
ck 'unknown proposal → 404' 404 "$(req GET "$BASE/proposals/00000000-0000-4000-8000-000000000000/similar-projects" -H "Authorization: Bearer $AT")"

echo
echo '== Coordinator scope remains ADR-17 inside every other surface =='

code=$(req GET "$BASE/projects/$PROJ_B" -H "Authorization: Bearer $CTA")
ck 'coordinator A reads foreign project workspace → 404' 404 "$code"
ck 'foreign workspace 404 carries RESOURCE_NOT_FOUND' 'RESOURCE_NOT_FOUND' "$(f error.code)"

code=$(req PATCH "$BASE/projects/$PROJ_B" -H "Authorization: Bearer $CTA" -H 'Content-Type: application/json' \
  -d '{"title":"Nope"}')
ck 'coordinator A writes a foreign project → 404' 404 "$code"

code=$(req GET "$LIB/$PROJ_B" -H "Authorization: Bearer $CTA")
ck 'the same coordinator reads that project through the library → 200' 200 "$code"

code=$(req GET "$BASE/proposals/$PROP_B" -H "Authorization: Bearer $CTA")
ck 'coordinator A reads a foreign proposal → 404' 404 "$code"

echo
echo "==================================="
echo "  PASS: $PASS   FAIL: $FAIL"
if [ "$FAIL" -gt 0 ]; then printf '  Failed: %s\n' "${FAILED[@]}"; fi
echo "==================================="
[ "$FAIL" -eq 0 ]
