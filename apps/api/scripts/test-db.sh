#!/usr/bin/env bash
#
# test-db.sh — operate on the TEST database only (apps/api/.env.test).
#
# The primary database (DATABASE_URL in apps/api/.env) is what the running app
# serves; this script's whole purpose is that schema work for tests can never
# touch it. It sources .env.test, which exports DATABASE_URL aimed at the
# throwaway database, then hands that to drizzle-kit / tsx.
#
#   bash scripts/test-db.sh status    # which database am I about to hit?
#   bash scripts/test-db.sh push      # apply src/schema to the test database
#   bash scripts/test-db.sh migrate   # apply the drizzle migration chain
#   bash scripts/test-db.sh seed      # ensure the suite admin account exists
#   bash scripts/test-db.sh reset     # DROP ALL + push + seed (fresh scratch)
#
# Refuses to run if .env.test's URL still points at the primary's database
# name, as a guard against the two files ever being swapped.
set -euo pipefail
cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
set -a; . ./.env.test; set +a

PRIMARY_URL="$(grep -E '^DATABASE_URL=' .env | cut -d= -f2- || true)"
if [ -z "${DATABASE_URL:-}" ]; then
  echo "test-db: .env.test did not export DATABASE_URL" >&2
  exit 1
fi
if [ -n "$PRIMARY_URL" ] && [ "$DATABASE_URL" = "$PRIMARY_URL" ]; then
  echo "test-db: .env.test DATABASE_URL is identical to the primary (.env) — refusing to run" >&2
  exit 1
fi

cmd="${1:-status}"
case "$cmd" in
  status)
    echo "test database: $DATABASE_URL"
    ;;
  push)
    npx drizzle-kit push --force
    ;;
  migrate)
    npx drizzle-kit migrate
    ;;
  seed)
    # Idempotent: the suite admin must exist and be active; the seed script
    # repairs role/password when given ADMIN_PASSWORD, otherwise leaves it be.
    ADMIN_EMAIL="${ADMIN_EMAIL:-admin@gmail.com}" \
    ADMIN_PASSWORD="${ADMIN_PASSWORD:-aim1234}" \
      npx tsx src/scripts/seed-admin.ts
    ;;
  reset)
    echo "test-db: dropping every table in the test database…"
    npx tsx - <<'EOF'
import { db } from './src/config/db.js';
import { sql } from 'drizzle-orm';
await db.execute(sql`DROP SCHEMA public CASCADE`);
await db.execute(sql`CREATE SCHEMA public`);
console.log('test-db: schema reset');
EOF
    npx drizzle-kit push --force
    ADMIN_EMAIL="${ADMIN_EMAIL:-admin@gmail.com}" \
    ADMIN_PASSWORD="${ADMIN_PASSWORD:-aim1234}" \
      npx tsx src/scripts/seed-admin.ts
    ;;
  *)
    echo "usage: bash scripts/test-db.sh {status|push|migrate|seed|reset}" >&2
    exit 2
    ;;
esac
