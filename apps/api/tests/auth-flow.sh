#!/usr/bin/env bash
# Phase 4 critical test: the full auth lifecycle end-to-end.
#   login → protected → token expires → refresh → continue → logout → refresh fails
# plus: rotation single-use, provisioning, activation, reset, revocation, roles.
set -u

BASE="${BASE:-http://localhost:${PORT:-3001}/api/v1}"
ADMIN_PASS='AdminPass123!'
NEW_STUDENT_PASS='StudentPass123!'
RESET_PASS='ResetPass456!'
STUDENT_EMAIL="student-$(date +%s)@test.local"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@thesistrack.local}"

JAR_ADMIN=/tmp/opencode/tt-admin.txt
JAR_STUDENT=/tmp/opencode/tt-student.txt
BODY=/tmp/opencode/tt-body.json
rm -f "$JAR_ADMIN" "$JAR_STUDENT" "$BODY"

PASS=0; FAIL=0; FAILED=()

req() { # METHOD URL [curl-args...]
  local method="$1" url="$2"; shift 2
  curl -s -o "$BODY" -w '%{http_code}' -X "$method" "$url" "$@"
}

f() { # dotted path into last response body
  node -pe "const d=JSON.parse(require('fs').readFileSync('$BODY','utf8')); const v=(()=>{try{return d.$1}catch(e){return 'undefined'}})(); v===undefined?'undefined':v" 2>/dev/null || echo 'undefined'
}

ck() { # name expected actual
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); printf '  PASS  %s\n' "$1"
  else FAIL=$((FAIL+1)); FAILED+=("$1"); printf '  FAIL  %s (expected [%s] got [%s])\n' "$1" "$2" "$3"; fi
}

jar_token() { awk '$6=="tt_refresh"{print $7}' "$1"; }

echo '== 1. Core critical test: login → protected → expire → refresh → continue → logout → refresh fails =='

code=$(req GET "$BASE/health");                                   ck 'health is public' 200 "$code"

code=$(req POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"wrong-password\"}")
ck 'wrong password rejected' 401 "$code"

code=$(req POST "$BASE/auth/login" -c "$JAR_ADMIN" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}")
ck 'login (admin) succeeds' 200 "$code"
AT1=$(f data.accessToken)
ck 'access token returned in body' 1 "$([ -n "$AT1" ] && [ "$AT1" != 'undefined' ] && echo 1 || echo 0)"
ck 'refresh cookie set (HTTP-only jar entry)' 1 "$( [ -s "$JAR_ADMIN" ] && echo 1 || echo 0 )"

code=$(req GET "$BASE/auth/me" -H "Authorization: Bearer $AT1");    ck 'access protected endpoint' 200 "$code"
ck '/me returns admin email' "$ADMIN_EMAIL" "$(f data.user.email)"

code=$(req GET "$BASE/auth/me");                                    ck 'protected endpoint without token' 401 "$code"

echo '   … waiting 4s for the access token to expire (requires server started with ACCESS_TOKEN_TTL=3) …'
sleep 4
code=$(req GET "$BASE/auth/me" -H "Authorization: Bearer $AT1");    ck 'expired access token rejected' 401 "$code"
if [ "$code" = "200" ]; then
  echo '   HINT: token still valid — restart the server with:  ACCESS_TOKEN_TTL=3 npx tsx src/server.ts'
fi
ck 'expiry reason surfaced' 'Access token has expired' "$(f error.message)"

RT1=$(jar_token "$JAR_ADMIN")
code=$(req POST "$BASE/auth/refresh" -b "$JAR_ADMIN" -c "$JAR_ADMIN"); ck 'refresh with cookie succeeds' 200 "$code"
AT2=$(f data.accessToken)
ck 'new access token issued' 1 "$([ -n "$AT2" ] && [ "$AT2" != "$AT1" ] && echo 1 || echo 0)"
RT2=$(jar_token "$JAR_ADMIN")
ck 'refresh cookie rotated' 1 "$([ -n "$RT2" ] && [ "$RT2" != "$RT1" ] && echo 1 || echo 0)"

code=$(req GET "$BASE/auth/me" -H "Authorization: Bearer $AT2");    ck 'continue with refreshed token' 200 "$code"

code=$(req POST "$BASE/auth/refresh" -H "Cookie: tt_refresh=$RT1"); ck 'old (rotated) refresh token rejected' 401 "$code"

code=$(req POST "$BASE/auth/logout" -b "$JAR_ADMIN" -c "$JAR_ADMIN"); ck 'logout succeeds' 200 "$code"
ck 'logout cookie cleared' 1 "$([ -z "$(jar_token "$JAR_ADMIN")" ] && echo 1 || echo 0)"

code=$(req POST "$BASE/auth/refresh" -H "Cookie: tt_refresh=$RT2"); ck 'revoked session cannot refresh' 401 "$code"
code=$(req POST "$BASE/auth/refresh" -b "$JAR_ADMIN");               ck 'refresh fails after logout' 401 "$code"

echo '== 2. Account provisioning: admin creates → INVITED → activate → ACTIVE =='

code=$(req POST "$BASE/users" -H 'Content-Type: application/json' \
  -d "{\"firstName\":\"New\",\"lastName\":\"Student\",\"email\":\"$STUDENT_EMAIL\",\"role\":\"student\"}")
ck 'provision without admin token' 401 "$code"

code=$(req POST "$BASE/auth/login" -c "$JAR_ADMIN" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}");  ck 'admin re-login' 200 "$code"
AT_ADMIN=$(f data.accessToken)

code=$(req GET "$BASE/users/nope" -H "Authorization: Bearer $AT_ADMIN") # keeps admin token warm

code=$(req POST "$BASE/users" -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d "{\"firstName\":\"New\",\"lastName\":\"Student\",\"email\":\"$STUDENT_EMAIL\",\"role\":\"student\"}")
ck 'admin provisions user' 201 "$code"
ck 'user is INVITED' 'INVITED' "$(f data.status)"
ACT_TOKEN1=$(f data.activationToken)

# Re-inviting an INVITED account rotates the token (latest invitation wins)
code=$(req POST "$BASE/users" -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d "{\"firstName\":\"New\",\"lastName\":\"Student\",\"email\":\"$STUDENT_EMAIL\",\"role\":\"student\"}")
ck 're-invitation succeeds' 200 "$code"
ck 'marked as reinvited' 'true' "$(f data.reinvited)"
ACT_TOKEN=$(f data.activationToken)
ck 'invitation token was rotated' 1 "$([ -n "$ACT_TOKEN" ] && [ "$ACT_TOKEN" != "$ACT_TOKEN1" ] && echo 1 || echo 0)"

code=$(req POST "$BASE/users" -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d "{\"firstName\":\"Dup\",\"lastName\":\"User\",\"email\":\"$ADMIN_EMAIL\",\"role\":\"student\"}")
ck 'duplicate of ACTIVE account conflicts' 409 "$code"

code=$(req POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$STUDENT_EMAIL\",\"password\":\"$NEW_STUDENT_PASS\"}")
ck 'invited user cannot log in yet' 401 "$code"

code=$(req POST "$BASE/auth/activate" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$ACT_TOKEN1\",\"password\":\"$NEW_STUDENT_PASS\"}")
ck 'superseded invitation token rejected' 400 "$code"

code=$(req POST "$BASE/auth/activate" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$ACT_TOKEN\",\"password\":\"$NEW_STUDENT_PASS\"}")
ck 'activation succeeds' 200 "$code"
ck 'account now ACTIVE' 'true' "$(f data.user.isActive)"

code=$(req POST "$BASE/auth/activate" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$ACT_TOKEN\",\"password\":\"$NEW_STUDENT_PASS\"}")
ck 'activation token is single-use' 400 "$code"

code=$(req POST "$BASE/auth/login" -c "$JAR_STUDENT" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$STUDENT_EMAIL\",\"password\":\"$NEW_STUDENT_PASS\"}")
ck 'activated user logs in' 200 "$code"
AT_STUDENT=$(f data.accessToken)

code=$(req POST "$BASE/users" -H "Authorization: Bearer $AT_STUDENT" -H 'Content-Type: application/json' \
  -d '{"firstName":"X","lastName":"Y","email":"x@test.local"}')
ck 'student cannot provision users' 403 "$code"

code=$(req POST "$BASE/auth/login" -H 'Content-Type: application/json' -d '{}')
ck 'invalid login body rejected' 400 "$code"
ck 'validation error code' 'VALIDATION_ERROR' "$(f error.code)"

echo '== 3. Password reset: forgot → reset → sessions revoked =='

RT_STUDENT=$(jar_token "$JAR_STUDENT")

code=$(req POST "$BASE/auth/forgot-password" -H 'Content-Type: application/json' \
  -d '{"email":"nobody@test.local"}')
ck 'unknown email: no enumeration (same 200)' 200 "$code"
ck 'unknown email: no devToken' 'undefined' "$(f data.devToken)"

code=$(req POST "$BASE/auth/forgot-password" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$STUDENT_EMAIL\"}")
ck 'forgot-password returns 200' 200 "$code"
RESET_TOKEN=$(f data.devToken)
ck 'reset token issued (dev)' 1 "$([ -n "$RESET_TOKEN" ] && [ "$RESET_TOKEN" != 'undefined' ] && echo 1 || echo 0)"

code=$(req POST "$BASE/auth/reset-password" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$RESET_TOKEN\",\"password\":\"$RESET_PASS\"}")
ck 'reset-password succeeds' 200 "$code"

code=$(req POST "$BASE/auth/reset-password" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$RESET_TOKEN\",\"password\":\"$RESET_PASS\"}")
ck 'reset token is single-use' 400 "$code"

code=$(req POST "$BASE/auth/refresh" -H "Cookie: tt_refresh=$RT_STUDENT")
ck 'password reset revokes existing sessions' 401 "$code"

code=$(req POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$STUDENT_EMAIL\",\"password\":\"$NEW_STUDENT_PASS\"}")
ck 'old password no longer works' 401 "$code"

code=$(req POST "$BASE/auth/login" -c "$JAR_STUDENT" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$STUDENT_EMAIL\",\"password\":\"$RESET_PASS\"}")
ck 'new password works' 200 "$code"
AT_STUDENT2=$(f data.accessToken)
code=$(req GET "$BASE/auth/me" -H "Authorization: Bearer $AT_STUDENT2")
ck 'reset user back on protected endpoint' 200 "$code"

echo
echo "==================================="
echo "  PASS: $PASS   FAIL: $FAIL"
if [ "$FAIL" -gt 0 ]; then printf '  Failed: %s\n' "${FAILED[@]}"; fi
echo "==================================="
[ "$FAIL" -eq 0 ]
