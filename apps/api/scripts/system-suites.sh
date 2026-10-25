#!/usr/bin/env bash
#
# system-suites.sh — run all five bash system suites against the TEST database.
#
# The suites are pure HTTP: they only reach a database through the server they
# drive. So this script boots that server itself with DATABASE_URL from
# apps/api/.env.test — the throwaway database — and never near the primary
# (apps/api/.env) or the developer's pnpm dev instance on :3001.
#
# Two servers, mirroring the established run pattern:
#   :4002  normal ACCESS_TOKEN_TTL   — user-mgmt, rbac, assignment, workflow
#   :4001  ACCESS_TOKEN_TTL=3        — auth-flow (its expiry tests need a token
#                                      that actually expires mid-suite)
#
#   bash scripts/system-suites.sh            # run everything
#   bash scripts/system-suites.sh --reset    # fresh scratch DB first
#
# ADMIN_EMAIL / ADMIN_PASSWORD default to the suite account seeded into the
# test database by scripts/test-db.sh seed.
set -euo pipefail
cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
set -a; . ./.env.test; set +a
if [ -z "${DATABASE_URL:-}" ]; then
  echo "system-suites: .env.test did not export DATABASE_URL" >&2
  exit 1
fi

export ADMIN_EMAIL="${ADMIN_EMAIL:-admin@gmail.com}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-aim1234}"
SUITE_PORT="${SUITE_PORT:-4002}"
EXPIRY_PORT="${EXPIRY_PORT:-4001}"

# Suite-server environment, mirroring what vitest.config.ts pins for tests:
#   NODE_ENV=test — auth returns invitation/activation/reset tokens in the
#     response only outside production (auth/controller.ts); production mode
#     hides them behind email delivery and the suites, which are pure HTTP,
#     can then never activate their own fixtures.
#   Empty mail creds — the mailer must skip, not open sockets: .env carries a
#     real BREVO_API_KEY/SMTP_HOST, and every suite invitation would otherwise
#     fire a live Brevo fetch mid-run (same rule as vitest's env overrides).
export NODE_ENV=test
export SMTP_HOST=''
export BREVO_API_KEY=''

if [ "${1:-}" = "--reset" ]; then
  bash scripts/test-db.sh reset
  # Match CI's baseline (seed:admin → seed:workflows → seed:templates,
  # .github/workflows/ci.yml). Without the workflow seed a fresh scratch DB has
  # no §8.10 default definition, and the §16.3 set-default block has no
  # "previous holder" to clear — a suite failure that says nothing about the
  # product. Both seeds are idempotent.
  npx tsx src/scripts/seed-workflows.ts
  npx tsx src/scripts/seed-milestone-templates.ts
fi

cleanup() {
  # Unquoted on purpose: `jobs -p` prints one PID per line and the shell must
  # word-split them — quoting turns "pid1\npid2" into a single invalid PID.
  # shellcheck disable=SC2046
  kill $(jobs -p) 2>/dev/null || true
  # `npx tsx` runs the server as a grandchild, so killing the job alone can
  # leave the listener orphaned (and the next run's port guard then refuses to
  # start). Close the two suite ports by PID as well; ss is Linux-only, so skip
  # silently elsewhere — the job kill above still covers the common case.
  if command -v ss >/dev/null 2>&1; then
    local pid
    for pid in $(ss -tlnp 2>/dev/null |
      grep -E ":($SUITE_PORT|$EXPIRY_PORT)[[:space:]]" |
      grep -oP 'pid=\K[0-9]+' | sort -u); do
      kill "$pid" 2>/dev/null || true
    done
  fi
}
trap cleanup EXIT INT TERM

# A stray server on either port would silently absorb this run's suites with
# whatever env it was started (the exact failure mode this guard exists for),
# so refuse to start instead of racing it.
for port in "$SUITE_PORT" "$EXPIRY_PORT"; do
  if curl -s --max-time 1 "http://localhost:$port/api/v1/health" >/dev/null 2>&1; then
    echo "system-suites: :$port already serves — a stray suite server is running; kill it first" >&2
    exit 1
  fi
done

wait_health() {
  local port=$1
  for _ in $(seq 1 40); do
    local code
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "http://localhost:$port/api/v1/health" || true)"
    [ "$code" = "200" ] && return 0
    sleep 1
  done
  echo "system-suites: server on :$port never became healthy" >&2
  return 1
}

echo "system-suites: test database → $DATABASE_URL"
PORT=$SUITE_PORT npx tsx src/server.ts >/tmp/opencode/suite-server.log 2>&1 &
PORT=$EXPIRY_PORT ACCESS_TOKEN_TTL=3 npx tsx src/server.ts >/tmp/opencode/suite-server-ttl3.log 2>&1 &
wait_health "$SUITE_PORT"
wait_health "$EXPIRY_PORT"

fails=0
run() {
  local name=$1 port=$2 script=$3
  if PORT=$port bash "$script" >"/tmp/opencode/suite-$name.log" 2>&1; then
    echo "$name: $(grep -oE 'PASS: [0-9]+ +FAIL: [0-9]+' "/tmp/opencode/suite-$name.log" | tail -1)"
  else
    echo "$name: FAILED (see /tmp/opencode/suite-$name.log)"
    fails=$((fails + 1))
  fi
}

run auth-flow "$EXPIRY_PORT" tests/auth-flow.sh
run user-mgmt "$SUITE_PORT" tests/user-mgmt.sh
run rbac "$SUITE_PORT" tests/rbac.sh
run assignment "$SUITE_PORT" tests/assignment.sh
run workflow "$SUITE_PORT" tests/system/workflow.sh

if [ "$fails" -gt 0 ]; then
  echo "system-suites: $fails suite(s) failed" >&2
  exit 1
fi
echo "system-suites: all five suites green against the test database"
