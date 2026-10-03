import { pgTable, uuid, varchar, text, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users.js';

/**
 * Configurable academic workflows (spec §3.4, ADR-15/ADR-16, FR-CW-01…08).
 *
 * A workflow is a *definition*: name, program, academic session, and an
 * ordered set of stages (workflow_stages). It is never edited in place once
 * projects reference it in a way that would alter those projects — stages are
 * snapshotted into project_stages at materialisation (ADR-15), so editing a
 * workflow affects FUTURE projects only.
 *
 * "Department" as an entity is REJECTED (ADR-11): `program` is a display
 * string, exactly like `users.program` it is matched against.
 */
export const workflows = pgTable(
  'workflows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    // Display string matched against users.program at approval time (ADR-16).
    // NULL = the catch-all / default workflow (unbounded, exempt from the
    // one-active-per-program index below).
    program: varchar('program', { length: 255 }),
    // e.g. '2026/2027' — display only, not a scheduling engine.
    academicSession: varchar('academic_session', { length: 32 }),
    description: text('description'),
    // ADR-16's fallback target: the workflow used when no program matches.
    isDefault: boolean('is_default').notNull().default(false),
    // Soft archive. Referenced workflows are never hard-deleted —
    // projects.workflow_id is ON DELETE RESTRICT (I15) — and archiving a
    // workflow releases its one-active-per-program slot.
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    // SET NULL: the definition outlives the account that authored it.
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // FR-CW-08 — exactly one ACTIVE workflow per program, so ADR-16's
    // program match is unambiguous. lower() so 'Software engineering' and
    // 'software engineering' cannot both hold the slot; program IS NOT NULL
    // exempts the NULL/default workflows (there may be many archived ones,
    // and NULLs would otherwise collide with each other in a unique index).
    uniqueIndex('workflows_one_active_per_program')
      .on(sql`lower(${table.program})`)
      .where(sql`archived_at is null and program is not null`),

    // ADR-16 — at most ONE default fallback among active workflows. The index
    // key is the parenthesized constant expression `(true)`: every
    // participating row keys the same value, so uniqueness allows a single
    // row. The parens are mandatory — a bare `true` is a syntax error in
    // PostgreSQL's index-element grammar (column | ( expression )).
    // archived_at is null means archiving the default releases the slot
    // (same discipline as the program index above).
    uniqueIndex('workflows_one_default')
      .on(sql`(true)`)
      .where(sql`archived_at is null and is_default`),
  ],
);

export const workflowsRelations = relations(workflows, ({ one, many }) => ({
  creator: one(users, {
    fields: [workflows.createdBy],
    references: [users.id],
  }),
  stages: many(workflowStages),
  projects: many(projects),
}));

import { workflowStages } from './workflow-stages.js';
import { projects } from './projects.js';
