import { pgTable, uuid, varchar, text, timestamp, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users.js';
import { projects } from './projects.js';
import { proposalStatusEnum } from './enums.js';

/**
 * A proposal belongs to a STUDENT, not to a project (spec §6.3, ADR-03).
 *
 * `projectId` is nullable and is set only when the proposal is approved, by
 * the §5.4 approval transaction — baseline §9 explicitly rejects
 * "Proposal = Project", so a draft has no project at all.
 *
 * `studentId` is NOT NULL: a proposal always has exactly one author, and that
 * author is who authorizes access to it (§13.3 — never via `projectId`).
 *
 * I4 — at most one in-flight proposal per student, enforced below.
 */
export const proposals = pgTable(
  'proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    // Nullable until §5.4 approval materialises the project.
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    version: integer('version').notNull().default(1),
    title: varchar('title', { length: 500 }).notNull(),
    // Short summary shown first in the review queue (§16.4); §11.6 requires it.
    abstract: text('abstract').notNull(),
    // In-browser editor content (§11.3, ADR-14) — optional, because a proposal
    // may instead be submitted as an uploaded PDF/Word document.
    body: text('body'),
    status: proposalStatusEnum('status').notNull().default('draft'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Partial: a pre-approval proposal has no project, so indexing NULLs buys
    // nothing (supersedes the plain idx_proposals_project_id, spec §8.3).
    index('idx_proposals_project_id')
      .on(table.projectId)
      .where(sql`project_id IS NOT NULL`),
    index('idx_proposals_student_id').on(table.studentId),
    index('idx_proposals_status').on(table.status),

    // I4 — one IN-FLIGHT proposal per student. Approved/rejected rows are
    // history and are deliberately excluded, so a student may propose again
    // after a rejection.
    uniqueIndex('idx_proposals_in_flight').on(table.studentId).where(
      sql`status IN ('draft','submitted','under_review','revision_required')`,
    ),
  ],
);

export const proposalsRelations = relations(proposals, ({ one }) => ({
  student: one(users, {
    fields: [proposals.studentId],
    references: [users.id],
  }),
  project: one(projects, {
    fields: [proposals.projectId],
    references: [projects.id],
  }),
}));
