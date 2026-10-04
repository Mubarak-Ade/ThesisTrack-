#!/usr/bin/env bash
# System test: the §5.4, §5.5 and §5.9 flows end-to-end against a live server
# (spec §17.3 — the fifth bash suite). Covers:
#
#   §5.4 Flow D  proposal lifecycle: draft → edit → submit → start-review →
#                revision_required → resubmit (version 2) → approved, and the
#                single approval transaction's seven steps (project INSERT,
#                proposal.project_id, assignment backfill, milestone
#                materialisation from the chosen template, ADR-16 workflow
#                resolution + stage materialisation, student notification,
#                append-only review row) — plus the rejected path releasing
#                the one-in-flight slot (§8.3)
#   §5.5 Flow E  submission & review: draft → submit (version 1 created) →
#                supervisor revision_required → multipart version 2 →
#                approved (tied milestone completes with completedAt) →
#                rejected branch → immutable version download
#   §5.9 Flow I  workflow config: create (+ duplicate-program 409), explicit
#                workflowId project path, program-matched auto-advance at
#                approval, gated advance → 422 unmet[] → 200 once satisfied,
#                final stage clears the active row without touching
#                project.status, whole-set definition edit leaves the
#                materialised snapshots frozen (ADR-15)
#
# Requires a running server and a seeded admin (pnpm seed:admin). Admin tokens
# are refreshed immediately before each admin call (short-TTL safe); student
# and supervisor tokens are re-issued at each block.
set -u

cd "$(dirname "$0")/../.."   # apps/api (suite lives in tests/system/)
BASE="${BASE:-http://localhost:${PORT:-3001}/api/v1}"
BODY=/tmp/opencode/wf-body.json
WORKFILE=/tmp/opencode/wf-v2.txt
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@thesistrack.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-AdminPass123!}"
STAMP=$(date +%s)
SHARED_PASS='FlowSuite123!'
PROG="Flow Program $STAMP"

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

n() { # raw JS expression over the last response body (`d`)
  node -pe "const d=JSON.parse(require('fs').readFileSync('$BODY','utf8')); ($1)" 2>/dev/null || echo 'undefined'
}

PASS=0; FAIL=0; FAILED=()
ck() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); printf '  PASS  %s\n' "$1"; else FAIL=$((FAIL+1)); FAILED+=("$1"); printf '  FAIL  %s (expected [%s] got [%s])\n' "$1" "$2" "$3"; fi }
ckj() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); printf '  PASS  %s\n' "$1"; else FAIL=$((FAIL+1)); FAILED+=("$1"); printf '  FAIL  %s\n        expected %s\n        got      %s\n' "$1" "$2" "$3"; fi }

AT=""
aal() { # fresh admin access token (short-TTL safe)
  req POST "$BASE/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" >/dev/null
  AT=$(f data.accessToken)
}

tok() { # email → fresh access token for a fixture account
  req POST "$BASE/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$SHARED_PASS\"}" >/dev/null
  f data.accessToken
}

mkuser() { # $1 = email suffix, $2 = role, $3 = program (or empty) → "id|email"
  local email="wf-$1-$STAMP@thesistrack.test"
  local prog=''
  [ -n "$3" ] && prog=",\"program\":\"$3\""   # §11.0.2 delta — HTTP write path
  req POST "$BASE/users" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
    -d "{\"firstName\":\"Flow\",\"lastName\":\"Suite\",\"email\":\"$email\",\"role\":\"$2\"$prog}" >/dev/null
  local token; token=$(f data.activationToken)
  req POST "$BASE/auth/activate" -H 'Content-Type: application/json' \
    -d "{\"token\":\"$token\",\"password\":\"$SHARED_PASS\"}" >/dev/null
  local uid; uid=$(f data.user.id)
  printf '%s|%s' "$uid" "$email"
}

echo '== Setup: template, actors, assignment, workflow configuration (§5.9 head) =='

aal
code=$(req POST "$BASE/milestone-templates" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Flow Suite $STAMP\",\"items\":[{\"title\":\"Flow chapter one\",\"dueOffsetDays\":7},{\"title\":\"Flow chapter two\",\"dueOffsetDays\":30}]}")
ck 'milestone template created (the §5.4 selection, §8.5)' 201 "$code"
TPL=$(f data.template.id)

aal
read -r SID SEMAIL <<<"$(mkuser stu student "$PROG" | tr '|' ' ')"
read -r SUPID SUPEMAIL <<<"$(mkuser sup supervisor '' | tr '|' ' ')"
ck 'student + supervisor provisioned and activated' 1 "$([ -n "$SID" ] && [ -n "$SUPID" ] && [ "${#SID}" = 36 ] && [ "${#SUPID}" = 36 ] && echo 1 || echo 0)"

aal
code=$(req POST "$BASE/students/$SID/supervisor" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d "{\"supervisorId\":\"$SUPID\"}")
ck 'admin assigns the supervisor first (§5.4 head — before any proposal)' 201 "$code"

aal
code=$(req POST "$BASE/workflows" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Flow Suite WF $STAMP\",\"program\":\"$PROG\",\"stages\":[{\"name\":\"Proposal approval\",\"requiresApproval\":true},{\"name\":\"Write-up review\",\"requiresSubmission\":true,\"requiresReview\":true},{\"name\":\"Defence\"}]}")
ck 'workflow created with three stages' 201 "$code"
W=$(f data.workflow.id)

aal
code=$(req POST "$BASE/workflows" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Flow Suite WF dup $STAMP\",\"program\":\"$PROG\"}")
ck 'second active workflow for the same program → 409 (§8.10)' 409 "$code"
ck 'conflict carries RESOURCE_CONFLICT' 'RESOURCE_CONFLICT' "$(f error.code)"

echo
echo "== §5.4 Flow D: draft → revision cycle → approval transaction =="

STOK=$(tok "$SEMAIL"); VTOK=$(tok "$SUPEMAIL")

code=$(req POST "$BASE/proposals" -H "Authorization: Bearer $STOK" -H 'Content-Type: application/json' \
  -d '{"title":"Flow suite proposal","abstract":"Draft.","body":"<p>Body.</p>"}')
ck 'POST /proposals → 201 (version 1)' 201 "$code"
ck 'status is draft' 'draft' "$(f data.proposal.status)"
ck 'version starts at 1' '1' "$(f data.proposal.version)"
PID=$(f data.proposal.id)

code=$(req PATCH "$BASE/proposals/$PID" -H "Authorization: Bearer $STOK" -H 'Content-Type: application/json' \
  -d '{"abstract":"Edited while DRAFT"}')
ck 'PATCH while DRAFT → 200' 200 "$code"
ck 'still draft after the edit' 'draft' "$(f data.proposal.status)"

code=$(req POST "$BASE/proposals/$PID/submit" -H "Authorization: Bearer $STOK")
ck 'submit → 201' 201 "$code"
ck 'status submitted' 'submitted' "$(f data.proposal.status)"
ck 'submit freezes the draft documents — version++ (I14)' '2' "$(f data.proposal.version)"

code=$(req POST "$BASE/proposals/$PID/start-review" -H "Authorization: Bearer $VTOK")
ck 'supervisor start-review → 200' 200 "$code"
ck 'status under_review' 'under_review' "$(f data.proposal.status)"

code=$(req POST "$BASE/proposals/$PID/review" -H "Authorization: Bearer $VTOK" -H 'Content-Type: application/json' \
  -d '{"decision":"revision_required","comment":"Needs a problem statement."}')
ck 'decision revision_required → 200' 200 "$code"
ck 'status revision_required' 'revision_required' "$(f data.proposal.status)"

code=$(req PATCH "$BASE/proposals/$PID" -H "Authorization: Bearer $STOK" -H 'Content-Type: application/json' \
  -d '{"abstract":"Revised problem statement"}')
ck 'student revises → 200' 200 "$code"

code=$(req POST "$BASE/proposals/$PID/submit" -H "Authorization: Bearer $STOK")
ck 'resubmit → 201' 201 "$code"
ck 'RESUBMITTED = submitted with version > 1 (here: 3rd frozen version)' '3' "$(f data.proposal.version)"

code=$(req POST "$BASE/proposals/$PID/start-review" -H "Authorization: Bearer $VTOK")
ck 'second start-review → 200' 200 "$code"

code=$(req POST "$BASE/proposals/$PID/review" -H "Authorization: Bearer $VTOK" -H 'Content-Type: application/json' \
  -d "{\"decision\":\"approved\",\"templateId\":\"$TPL\"}")
ck 'approval → 200 (the §5.4 transaction)' 200 "$code"
ck 'proposal is approved' 'approved' "$(f data.proposal.status)"
ck 'transaction returned the created project' '1' "$([ "$(f data.project.id | wc -c)" -eq 37 ] && echo 1 || echo 0)"
PRJ=$(f data.project.id)
ck 'append-only review row returned' '1' "$([ "$(f data.review.id | wc -c)" -eq 37 ] && echo 1 || echo 0)"

code=$(req GET "$BASE/proposals/$PID" -H "Authorization: Bearer $STOK")
ck 'step 2: proposal.project_id set' "$PRJ" "$(f data.proposal.projectId)"

aal
code=$(req GET "$BASE/projects/$PRJ" -H "Authorization: Bearer $AT")
ck 'step 1: project row is active' 'active' "$(f data.project.status)"
ck 'ADR-16: matched the program workflow' "$W" "$(f data.project.workflowId)"

code=$(req GET "$BASE/projects/$PRJ/milestones" -H "Authorization: Bearer $STOK")
ck 'step 4: milestones materialised from the chosen template' '2' "$(n 'd.data.milestones.length')"

code=$(req GET "$BASE/students/$SID/supervisor" -H "Authorization: Bearer $AT")
ck 'step 3: active assignment back-filled with project_id' "$PRJ" "$(f data.active.projectId)"

aal
code=$(req GET "$BASE/projects/$PRJ/stages" -H "Authorization: Bearer $AT")
ck 'step 5: three stages materialised' '3' "$(n 'd.data.stages.length')"
ck 'snapshot: definition names copied' 'Proposal approval' "$(f data.stages[0].name)"
ck '§5.9 automatic advancement: approval-gated stage 1 completed' 'completed' "$(f data.stages[0].status)"
ck 'one step: stage 2 is now active' 'active' "$(f data.stages[1].status)"
ck 'stage 3 untouched' 'pending' "$(f data.stages[2].status)"

code=$(req GET "$BASE/notifications?limit=100" -H "Authorization: Bearer $STOK")
ck 'step 6: student received a proposal notification' 1 "$([ "$(n "d.data.notifications.filter(x=>x.type==='proposal').length")" -ge 1 ] && echo 1 || echo 0)"

echo
echo "== §5.9: gated advance 422 → explicit-workflowId path → frozen snapshots =="

aal
code=$(req GET "$BASE/projects/$PRJ/stages" -H "Authorization: Bearer $AT")
ckj 'stage 2 reports both gates unmet' '["requires_submission","requires_review"]' \
  "$(n 'JSON.stringify(d.data.current.unmet)')"
ST_FROZEN=$(n 'JSON.stringify(d.data.stages.map(s=>[s.position,s.status,s.name]))')

VTOK=$(tok "$SUPEMAIL")
code=$(req POST "$BASE/projects/$PRJ/stages/advance" -H "Authorization: Bearer $VTOK")
ck 'assigned supervisor advances → 422 while gates are unmet' 422 "$code"
ck 'error code BUSINESS_RULE_VIOLATION' 'BUSINESS_RULE_VIOLATION' "$(f error.code)"
ckj 'details[] name the unmet gates in ladder order' \
  '[{"path":"unmet","message":"requires_submission"},{"path":"unmet","message":"requires_review"}]' \
  "$(n 'JSON.stringify(d.error.details)')"
aal
code=$(req GET "$BASE/projects/$PRJ/stages" -H "Authorization: Bearer $AT")
ckj 'refusal never half-advances (tracker unchanged after the 422)' "$ST_FROZEN" \
  "$(n 'JSON.stringify(d.data.stages.map(s=>[s.position,s.status,s.name]))')"

aal
read -r SID2 _ <<<"$(mkuser stu2 student '' | tr '|' ' ')"
code=$(req POST "$BASE/projects" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d "{\"studentId\":\"$SID2\",\"title\":\"Flow suite explicit workflow\",\"description\":\"§5.9 explicit path\",\"workflowId\":\"$W\"}")
ck 'admin project creation with explicit workflowId → 201' 201 "$code"
P2=$(f data.project.id)

aal
code=$(req GET "$BASE/projects/$P2/stages" -H "Authorization: Bearer $AT")
ck 'explicit path materialised the same stages' '3' "$(n 'd.data.stages.length')"
ck 'stage 1 active' 'active' "$(f data.stages[0].status)"
ckj 'its approval gate reads unmet' '["requires_approval"]' "$(n 'JSON.stringify(d.data.current.unmet)')"

aal
code=$(req POST "$BASE/projects/$P2/stages/advance" -H "Authorization: Bearer $AT")
ck 'advance refused — the server never trusts the caller (§11.14)' 422 "$code"
ck 'names the unmet gate' 'requires_approval' "$(f error.details[0].message)"

aal
code=$(req GET "$BASE/workflows/$W" -H "Authorization: Bearer $AT")
G1=$(f data.stages[0].id); G2=$(f data.stages[1].id); G3=$(f data.stages[2].id)
code=$(req PATCH "$BASE/workflows/$W" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d '{"stages":[{"id":"'$G1'","name":"Proposal approval (renamed)","requiresApproval":true},{"id":"'$G2'","name":"Write-up review (renamed)","requiresSubmission":true,"requiresReview":true},{"id":"'$G3'","name":"Defence (renamed)"}]}')
ck 'whole-set definition edit (FR-CW-01…03) → 200' 200 "$code"

aal
code=$(req GET "$BASE/workflows/$W" -H "Authorization: Bearer $AT")
ckj 'definition reflects the rename (server renumbered positions)' \
  '["Proposal approval (renamed)","Write-up review (renamed)","Defence (renamed)"]' \
  "$(n 'JSON.stringify(d.data.stages.map(s=>s.name))')"

aal
code=$(req GET "$BASE/projects/$PRJ/stages" -H "Authorization: Bearer $AT")
ckj 'materialised snapshots frozen by the definition edit (ADR-15)' "$ST_FROZEN" \
  "$(n 'JSON.stringify(d.data.stages.map(s=>[s.position,s.status,s.name]))')"

echo
echo "== §5.5 Flow E: submission → review → version 2 → milestone completes =="

STOK=$(tok "$SEMAIL"); VTOK=$(tok "$SUPEMAIL")

code=$(req GET "$BASE/projects/$PRJ/milestones" -H "Authorization: Bearer $STOK")
MID=$(n "d.data.milestones.find(m=>m.title==='Flow chapter one').id")
ck 'the materialised milestone is readable by the owner' 1 "$([ "${#MID}" -eq 36 ] && echo 1 || echo 0)"

code=$(req POST "$BASE/submissions" -H "Authorization: Bearer $STOK" -H 'Content-Type: application/json' \
  -d "{\"projectId\":\"$PRJ\",\"milestoneId\":\"$MID\",\"title\":\"Flow suite submission\"}")
ck 'POST /submissions → 201' 201 "$code"
ck 'status draft' 'draft' "$(f data.submission.status)"
SUB=$(f data.submission.id)

code=$(req POST "$BASE/submissions/$SUB/submit" -H "Authorization: Bearer $STOK")
ck 'submit → 201 (creates version 1)' 201 "$code"
ck 'status submitted' 'submitted' "$(f data.submission.status)"

code=$(req GET "$BASE/submissions/$SUB/versions" -H "Authorization: Bearer $STOK")
ck 'version 1 exists' '1' "$(n 'd.data.versions.length')"

code=$(req POST "$BASE/submissions/$SUB/reviews" -H "Authorization: Bearer $VTOK" -H 'Content-Type: application/json' \
  -d '{"decision":"revision_required","comment":"Tighten the evaluation."}')
ck 'supervisor review revision_required → 201' 201 "$code"
ck 'status revision_required' 'revision_required' "$(f data.submission.status)"

printf 'Flow suite version two — %s\n' "$STAMP" > "$WORKFILE"
code=$(req POST "$BASE/submissions/$SUB/versions" -H "Authorization: Bearer $STOK" \
  -F "file=@$WORKFILE;type=text/plain")
ck 'multipart version append → 201 (a new INSERT, never an UPDATE — I7)' 201 "$code"
ck 'versionNumber is 2' '2' "$(f data.version.versionNumber)"
ck 'status back to submitted' 'submitted' "$(f data.submission.status)"

code=$(req GET "$BASE/submissions/$SUB/versions" -H "Authorization: Bearer $STOK")
ck 'two immutable versions' '2' "$(n 'd.data.versions.length')"
V1=$(n "d.data.versions.find(v=>v.versionNumber===1).id")
V2=$(n "d.data.versions.find(v=>v.versionNumber===2).id")

code=$(req GET "$BASE/submission-versions/$V1/download" -H "Authorization: Bearer $STOK")
ck 'text version download → 404 (§14.2: a body carries no file)' 404 "$code"
code=$(req GET "$BASE/submission-versions/$V2/download" -H "Authorization: Bearer $STOK")
ck 'the uploaded version downloads its bytes → 200 (§14.4)' 200 "$code"

code=$(req POST "$BASE/submissions/$SUB/reviews" -H "Authorization: Bearer $VTOK" -H 'Content-Type: application/json' \
  -d '{"decision":"approved"}')
ck 'approved on the second round → 201' 201 "$code"
ck 'status approved' 'approved' "$(f data.submission.status)"

code=$(req GET "$BASE/projects/$PRJ/milestones" -H "Authorization: Bearer $STOK")
ck '§5.5: tied milestone approved' 'approved' "$(n "d.data.milestones.find(m=>m.id==='$MID').status")"
ck '§5.5: completedAt set' 'true' "$(n "String(d.data.milestones.find(m=>m.id==='$MID').completedAt!==null)")"

code=$(req POST "$BASE/submissions" -H "Authorization: Bearer $STOK" -H 'Content-Type: application/json' \
  -d "{\"projectId\":\"$PRJ\",\"title\":\"Rejected branch\"}")
ck 'second submission on the same project → 201' 201 "$code"
SUB2=$(f data.submission.id)
code=$(req POST "$BASE/submissions/$SUB2/submit" -H "Authorization: Bearer $STOK"); ck 'second submit → 201' 201 "$code"
code=$(req POST "$BASE/submissions/$SUB2/reviews" -H "Authorization: Bearer $VTOK" -H 'Content-Type: application/json' \
  -d '{"decision":"rejected","comment":"Out of scope."}')
ck 'rejected branch → 201' 201 "$code"
ck 'status rejected' 'rejected' "$(f data.submission.status)"

echo
echo "== §5.9: the satisfied gates advance 200 → final stage → activity feed =="

VTOK=$(tok "$SUPEMAIL")
code=$(req POST "$BASE/projects/$PRJ/stages/advance" -H "Authorization: Bearer $VTOK")
ck 'advance succeeds once the gates are satisfied → 200' 200 "$code"
ckj 'stage 2 completed, stage 3 active' '["completed","completed","active"]' \
  "$(n 'JSON.stringify(d.data.stages.map(s=>s.status))')"

aal
code=$(req GET "$BASE/projects/$PRJ/stages" -H "Authorization: Bearer $AT")
ck 'current is the final stage' '3' "$(f data.current.position)"
ckj 'nothing unmet' '[]' "$(n 'JSON.stringify(d.data.current.unmet)')"

code=$(req POST "$BASE/projects/$PRJ/stages/advance" -H "Authorization: Bearer $VTOK")
ck 'final stage advances → 200' 200 "$code"

aal
code=$(req GET "$BASE/projects/$PRJ/stages" -H "Authorization: Bearer $AT")
ckj 'I16: zero active rows after the final stage' 'null' "$(f data.current)"
ckj 'every stage completed' '["completed","completed","completed"]' \
  "$(n 'JSON.stringify(d.data.stages.map(s=>s.status))')"

aal
code=$(req GET "$BASE/projects/$PRJ" -H "Authorization: Bearer $AT")
ck 'project.status untouched by completion (§5.9)' 'active' "$(f data.project.status)"

aal
code=$(req GET "$BASE/projects/$PRJ/activity" -H "Authorization: Bearer $AT")
ck 'FR-CW-07: activity feed carries stage.started AND stage.completed' '2' \
  "$(n "new Set(d.data.activity.filter(a=>a.kind.indexOf('stage.')===0).map(a=>a.kind)).size")"

echo
echo "== §5.4 rejected path releases the one-in-flight slot (§8.3) =="

STOK=$(tok "$SEMAIL"); VTOK=$(tok "$SUPEMAIL")

code=$(req POST "$BASE/proposals" -H "Authorization: Bearer $STOK" -H 'Content-Type: application/json' \
  -d '{"title":"Flow suite proposal two","abstract":"After approval.","body":"<p>Body.</p>"}')
ck 'approval released the slot → a new proposal → 201' 201 "$code"
PID2=$(f data.proposal.id)

code=$(req POST "$BASE/proposals/$PID2/submit" -H "Authorization: Bearer $STOK"); ck 'submit → 201' 201 "$code"
code=$(req POST "$BASE/proposals/$PID2/start-review" -H "Authorization: Bearer $VTOK"); ck 'start-review → 200' 200 "$code"
code=$(req POST "$BASE/proposals/$PID2/review" -H "Authorization: Bearer $VTOK" -H 'Content-Type: application/json' \
  -d '{"decision":"rejected","comment":"Different topic."}')
ck 'rejected → 200' 200 "$code"
ck 'status rejected' 'rejected' "$(f data.proposal.status)"

code=$(req POST "$BASE/proposals" -H "Authorization: Bearer $STOK" -H 'Content-Type: application/json' \
  -d '{"title":"Flow suite proposal three","abstract":"Rejection freed the slot.","body":"<p>Body.</p>"}')
ck 'rejection released the slot → another proposal → 201' 201 "$code"

echo
echo "== §16.3 workflow builder: set default via PATCH (PROPOSED delta 2026-10-04) =="

aal
code=$(req GET "$BASE/workflows?limit=100" -H "Authorization: Bearer $AT")
ORIG_DEF=$(n "d.data.workflows.find(w=>w.isDefault===true).id")

aal
code=$(req POST "$BASE/workflows" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d "{\"name\":\"SetDefault WF $STAMP\",\"program\":\"SetDef Prog $STAMP\",\"stages\":[{\"name\":\"One\"}]}")
ck 'set-default fixture workflow created → 201' 201 "$code"
SD=$(f data.workflow.id)
ck 'POST never steals the flag (§8.10)' 'false' "$(f data.workflow.isDefault)"

aal
code=$(req PATCH "$BASE/workflows/$SD" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d '{"isDefault":true}')
ck 'PATCH {isDefault:true} → 200' 200 "$code"
ck 'the row reports isDefault true' 'true' "$(f data.workflow.isDefault)"

aal
code=$(req GET "$BASE/workflows?limit=100" -H "Authorization: Bearer $AT")
ck 'the flag shows on the list' 'true' "$(n "d.data.workflows.find(w=>w.id==='$SD').isDefault")"
ck 'the previous holder cleared in the same write' 'false' "$(n "d.data.workflows.find(w=>w.id==='$ORIG_DEF').isDefault")"

aal
code=$(req POST "$BASE/workflows" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d "{\"name\":\"SetDefault archived $STAMP\",\"program\":\"SetDef Arch $STAMP\",\"stages\":[]}")
SD2=$(f data.workflow.id)
code=$(req PATCH "$BASE/workflows/$SD2" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d '{"archived":true}')
ck 'archived → 200' 200 "$code"
code=$(req PATCH "$BASE/workflows/$SD2" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d '{"isDefault":true}')
ck 'an archived workflow cannot be set default → 422' 422 "$code"
ck 'refusal is BUSINESS_RULE_VIOLATION on path isDefault' 'BUSINESS_RULE_VIOLATION' "$(f error.code)"

aal
code=$(req PATCH "$BASE/workflows/$ORIG_DEF" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d '{"isDefault":true}')
ck 'the original default is restored → 200' 200 "$code"
ck 'restore re-flags it' 'true' "$(f data.workflow.isDefault)"

echo
echo "==================================="
echo "  PASS: $PASS   FAIL: $FAIL"
if [ "$FAIL" -gt 0 ]; then printf 'Failed: %s\n' "${FAILED[@]}"; echo "==================================="; exit 1; fi
echo "==================================="
