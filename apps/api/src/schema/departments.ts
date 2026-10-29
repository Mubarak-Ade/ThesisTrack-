import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

/**
 * Departments (design 2026-10-28, PROPOSED ADR-11 reversal).
 *
 * One administrator-managed list feeding both user accounts (`users.department_id`)
 * and workflow matching (`workflows.department_id`, ADR-16). This replaces the
 * free-text `users.program` / `users.department` strings, whose typo drift could
 * silently drop a student onto the default workflow.
 *
 * `code` is the department's short code (e.g. `SWE`) — the `DEPT` segment of a
 * student registration number (`CST/22/SWE/00825`). It is nullable ONLY for
 * legacy rows created by the 2026-10-28 backfill; new departments require one.
 *
 * Departments are never hard-deleted (I15 spirit — the same soft-archive rule as
 * workflows): archiving frees the one-active-workflow slot and keeps every
 * historical reference intact.
 */
export const departments = pgTable(
  'departments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    // 'SWE' — `DEPT` in a student registration number. NULL = legacy backfill row.
    code: varchar('code', { length: 8 }),
    // Soft archive; NULL = active. Archiving is refused while an ACTIVE
    // workflow holds this department (FR-CW-08 slot), enforced in the service.
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    // SET NULL: the definition outlives the account that authored it.
    createdBy: uuid('created_by').references((): AnyPgColumn => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Names and codes are unique among ACTIVE departments only, case-insensitively.
    // Archiving releases both slots, so an archived department's name/code can be
    // reused — reactivation re-checks in the service before it is attempted.
    uniqueIndex('departments_active_name')
      .on(sql`lower(${table.name})`)
      .where(sql`archived_at is null`),
    uniqueIndex('departments_active_code')
      .on(sql`upper(${table.code})`)
      .where(sql`archived_at is null and code is not null`),
  ],
);

import { users } from './users.js';
import { workflows } from './workflows.js';

export const departmentsRelations = relations(departments, ({ one, many }) => ({
  // The administrator who created the definition (SET NULL on account deletion).
  creator: one(users, {
    fields: [departments.createdBy],
    references: [users.id],
  }),
  members: many(users),
  workflows: many(workflows),
}));
