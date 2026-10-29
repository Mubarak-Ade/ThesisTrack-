import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users.js';

/**
 * Configurable academic workflows (spec §3.4, ADR-15/ADR-16, FR-CW-01…08).
 *
 * A workflow is a *definition*: name, department, academic session, and an
 * ordered set of stages (workflow_stages). It is never edited in place once
 * projects reference it in a way that would alter those projects — stages are
 * snapshotted into project_stages at materialisation (ADR-15), so editing a
 * workflow affects FUTURE projects only.
 *
 * ADR-11 is reversed (PROPOSED, design 2026-10-28): the match key is the
 * managed `department_id` FK, not a free-text string, so a typo can no longer
 * silently drop a student onto the default workflow.
 */
export const workflows = pgTable(
  'workflows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    // Managed department (design 2026-10-28) — replaces the old free-text
    // `program` string; ADR-16 matches on this FK. NULL = catch-all/default.
    departmentId: uuid('department_id').references((): AnyPgColumn => departments.id, {
      onDelete: 'restrict',
    }),
    // e.g. '2026/2027' — display only, not a scheduling engine.
    academicSession: varchar('academic_session', { length: 32 }),
    description: text('description'),
    // ADR-16's fallback target: the workflow used when no department matches.
    isDefault: boolean('is_default').notNull().default(false),
    // Soft archive. Referenced workflows are never hard-deleted —
    // projects.workflow_id is ON DELETE RESTRICT (I15) — and archiving a
    // workflow releases its one-active-per-department slot.
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    // SET NULL: the definition outlives the account that authored it.
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // FR-CW-08, department-keyed (design 2026-10-28): exactly one ACTIVE
    // workflow per department, so ADR-16's match is unambiguous and typo-proof.
    // NULLs (the catch-all/default workflow) are exempt.
    uniqueIndex('workflows_one_active_per_department')
      .on(table.departmentId)
      .where(sql`archived_at is null and department_id is not null`),

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
  // Managed department (design 2026-10-28) — ADR-16's match key.
  department: one(departments, {
    fields: [workflows.departmentId],
    references: [departments.id],
  }),
  stages: many(workflowStages),
  projects: many(projects),
}));

import { workflowStages } from './workflow-stages.js';
import { projects } from './projects.js';
import { departments } from './departments.js';
