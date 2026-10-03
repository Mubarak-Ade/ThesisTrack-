import { pgTable, uuid, varchar, text, integer, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { workflows } from './workflows.js';
import { userRoleEnum } from './enums.js';

/**
 * One ordered step of a workflow definition (spec §8.10, FR-CW-02/03).
 *
 * This row is *definition*, not state. When a project materialises its
 * stages, every descriptive and gating field below is COPIED onto
 * project_stages (ADR-15 — the ADR-05 milestone-template precedent), so
 * later edits here never move a live project's stages.
 *
 * `responsible_role` is descriptive only — who acts at this stage — and is
 * NEVER an authorization input; §4.6's RBAC is authoritative.
 */
export const workflowStages = pgTable(
  'workflow_stages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    // 1..n, contiguous within the workflow; enforced by the service on the
    // whole-set PATCH (FR-CW-02) and pinned here by the unique below.
    position: integer('position').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    // Deadline is computed at read: stage.started_at + due_offset_days.
    // Never an absolute date on the definition — the offset is what is
    // configured, exactly like milestone_templates items dueOffsetDays.
    dueOffsetDays: integer('due_offset_days'),
    // Required deliverable — a label ('Proposal PDF', 'Source code + report'),
    // not a file reference; files live on submissions (§5.5).
    deliverable: varchar('deliverable', { length: 255 }),
    // Descriptive only: student | supervisor | administrator.
    responsibleRole: userRoleEnum('responsible_role'),
    // The §11.14 advance gates — evaluated server-side, never trusted from
    // the client. All three false = the stage advances freely.
    requiresSubmission: boolean('requires_submission').notNull().default(false),
    requiresReview: boolean('requires_review').notNull().default(false),
    requiresApproval: boolean('requires_approval').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Positions are unique within one definition; renumbering happens in the
    // same transaction as the whole-set edit so this can never half-hold.
    uniqueIndex('workflow_stages_workflow_position_unique').on(table.workflowId, table.position),
  ],
);

export const workflowStagesRelations = relations(workflowStages, ({ one, many }) => ({
  workflow: one(workflows, {
    fields: [workflowStages.workflowId],
    references: [workflows.id],
  }),
  projectStages: many(projectStages),
}));

import { projectStages } from './project-stages.js';
