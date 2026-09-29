#!/usr/bin/env bash
#
# schema-drift.sh — prove that the migration chain and src/schema actually agree.
#
# Why this exists (spec §8.8)
# ---------------------------
# `drizzle-kit generate` compares src/schema against drizzle/meta/*.snapshot.json.
# It never reads the .sql files and never connects to a database, so it reports
# "No schema changes, nothing to migrate" even when the applied migrations have
# drifted from the schema. That is precisely how two defects survived:
#
#   1. users.password_hash stayed NOT NULL, although src/schema declares it
#      nullable (breaks provisionUser, which inserts password_hash: null)
#   2. account_tokens exists in src/schema, but no migration ever created it
#
# Closing the hole means diffing two real databases:
#
#   <db>_drift_a  <- drizzle-kit migrate   (what the .sql files really produce)
#   <db>_drift_b  <- drizzle-kit push      (what src/schema really declares)
#
# Exit 0 = no drift · Exit 1 = drift (diff printed) · Exit 2 = setup failure.

set -euo pipefail

cd "$(dirname "$0")/.."   # apps/api

if [[ -z "${DATABASE_URL:-}" ]]; then
  # Fall back to apps/api/.env, the same file drizzle.config.ts reads.
  [[ -f .env ]] || { echo "schema-drift: DATABASE_URL unset and no .env found" >&2; exit 2; }
  DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)"
  [[ -n "$DATABASE_URL" ]] || { echo "schema-drift: DATABASE_URL missing from .env" >&2; exit 2; }
fi

# postgresql://user:pass@host:port/name  ->  components
DB_USER="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[a-z]+://([^:/]+).*#\1#')"
DB_PASS="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[a-z]+://[^:]+:([^@]+)@.*#\1#')"
DB_HOST="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[a-z]+://[^@]*@([^:/]+).*#\1#')"
DB_PORT="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[a-z]+://[^@]*@[^:]+:([0-9]+).*#\1#')"
DB_NAME="$(printf '%s' "$DATABASE_URL" | sed -E 's#.*/([A-Za-z0-9_-]+)(\?.*)?$#\1#')"
[[ "$DB_PORT" =~ ^[0-9]+$ ]] || DB_PORT=5432

export PGPASSWORD="$DB_PASS"

PSQL=(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -v ON_ERROR_STOP=1 -q -At)

ADMIN_URL="postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/postgres"
DB_A="${DB_NAME}_drift_a"
DB_B="${DB_NAME}_drift_b"

cleanup() {
  "${PSQL[@]}" "$ADMIN_URL" -c "DROP DATABASE IF EXISTS $DB_A;" >/dev/null 2>&1 || true
  "${PSQL[@]}" "$ADMIN_URL" -c "DROP DATABASE IF EXISTS $DB_B;" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# What src/schema declares vs what the .sql files produce, normalised to one line
# per object. Both queries filter to schema 'public' so drizzle's own bookkeeping
# schema (drizzle.__drizzle_migrations) can never produce a false positive.
read -r -d '' SNAPSHOT_SQL <<'SQL' || true
select 'TABLE ' || table_name
  from information_schema.tables
  where table_schema='public' and table_type='BASE TABLE' order by 1;
select 'COLUMN ' || table_name || '.' || column_name || ' ' || data_type
       || coalesce('('||character_maximum_length||')','') || ' ' || is_nullable
       || ' ' || coalesce(column_default,'-')
  from information_schema.columns where table_schema='public' order by 1;
select 'ENUM ' || t.typname || '.' || e.enumlabel
  from pg_type t
  join pg_enum e on e.enumtypid = t.oid
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname='public' order by 1;
select 'CONSTRAINT ' || conrelid::regclass::text || '.' || conname || ' '
       || pg_get_constraintdef(oid)
  from pg_constraint where connamespace='public'::regnamespace order by 1;
select 'INDEX ' || indexname || ' ON ' || tablename || ' ' || indexdef
  from pg_indexes where schemaname='public' order by 1;
SQL

echo "schema-drift: source db = $DB_NAME"
echo "schema-drift: creating $DB_A (migrate) and $DB_B (push) ..."

"${PSQL[@]}" "$ADMIN_URL" -c "DROP DATABASE IF EXISTS $DB_A;" >/dev/null 2>&1 || true
"${PSQL[@]}" "$ADMIN_URL" -c "DROP DATABASE IF EXISTS $DB_B;" >/dev/null 2>&1 || true
"${PSQL[@]}" "$ADMIN_URL" -c "CREATE DATABASE $DB_A;" >/dev/null
"${PSQL[@]}" "$ADMIN_URL" -c "CREATE DATABASE $DB_B;" >/dev/null

URL_A="postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DB_A"
URL_B="postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DB_B"

echo "schema-drift: applying migration chain to $DB_A ..."
DATABASE_URL="$URL_A" pnpm db:migrate >/dev/null

echo "schema-drift: applying src/schema to $DB_B ..."
DATABASE_URL="$URL_B" pnpm db:push --force >/dev/null

TMP="$(mktemp -d)"
trap 'cleanup; rm -rf "$TMP"' EXIT

printf '%s\n' "$SNAPSHOT_SQL" | "${PSQL[@]}" "$URL_A" > "$TMP/migrated.txt"
printf '%s\n' "$SNAPSHOT_SQL" | "${PSQL[@]}" "$URL_B" > "$TMP/declared.txt"

if diff -u "$TMP/migrated.txt" "$TMP/declared.txt" > "$TMP/drift.txt"; then
  echo "schema-drift: OK — migrations and src/schema agree ($(wc -l < "$TMP/migrated.txt") objects)."
  exit 0
fi

echo
echo "schema-drift: DRIFT DETECTED"
echo "  <  produced by the migration chain (drizzle/*.sql)"
echo "  >  declared by src/schema (drizzle-kit push)"
echo
cat "$TMP/drift.txt"
echo
echo "schema-drift: repair the migration chain so both sides match."
echo "  Note: 'pnpm db:generate' CANNOT detect this — it compares schema to the"
echo "  snapshot JSON, not to the .sql files or to a database."
exit 1
