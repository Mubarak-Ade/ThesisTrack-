import { pgTable, uuid, varchar, text, integer, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { projects } from './projects.js';
import { workflowStages } from './workflow-stages.js';
import { users } from './users.js';
import { userRoleEnum, projectStageStatusEnum } from './enums.js';

/**
 * A workflow stage materialised onto one project (spec §8.11, ADR-15, I15–I17).
 *
 * SNAPSHOT semantics: every descriptive and gating field below is COPIED from
 * workflow_stages at materialisation (approval tx step 5) — the same way
 * milestones snapshot dueOffsetDays from milestone_templates (ADR-05).
 * Editing the workflow afterwards affects future projects only; a live
 * project's stage names, deadlines and gates can never shift under its
 * participants. `workflowStageId` remains purely provenance (RESTRICT — the
 * definition that produced this row is academic history).
 *
 * Transition record (FR-CW-06): started_* / completed_* say when the stage
 * went active and who advanced it; history (FR-CW-07) is derived from these
 * columns via the §11.13 activity feed — there is deliberately no event
 * table (§8.12, ADR-15).
 *
 * There is NO updated_at here: this table is append-once plus two immutable
 * transition stamps; the §8.0 timestamps convention applies to mutable
 * definition rows, as it did to milestone_versions-style history (the
 * precedent being submission_versions, which carries created_at only).
 */
export const projectStages = pgTable(
  'project_stages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    // Provenance only — never read to decide anything about a live stage
    // (all such fields are snapshotted here).
    workflowStageId: uuid('workflow_stage_id')
      .notNull()
      .references(() => workflowStages.id, { onDelete: 'restrict' }),
    // Frozen at materialisation (I17) — never renumbered.
    position: integer('position').notNull(),
    status: projectStageStatusEnum('status').notNull().default('pending'),

    // --- frozen snapshot of the definition (ADR-15) ---
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    dueOffsetDays: integer('due_offset_days'),
    deliverable: varchar('deliverable', { length: 255 }),
    responsibleRole: userRoleEnum('responsible_role'),
    requiresSubmission: boolean('requires_submission').notNull().default(false),
    requiresReview: boolean('requires_review').notNull().default(false),
    requiresApproval: boolean('requires_approval').notNull().default(false),

    // --- transition record (FR-CW-06) ---
    // started_at is set when status flips to 'active' (stage 1 at
    // materialisation; the next stage at advance). It anchors the computed
    // deadline (started_at + due_offset_days) and the §11.14 gate windows.
    startedAt: timestamp('started_at', { withTimezone: true }),
    startedBy: uuid('started_by').references(() => users.id, { onDelete: 'set null' }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedBy: uuid('completed_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('project_stages_project_position_unique').on(table.projectId, table.position),

    // I16 — AT MOST ONE active stage per project. At most, not exactly: a
    // project whose final stage completed has zero active rows, which this
    // partial index permits. The advance transaction completes current +
    // activates next in one tx, so a double-active can only arrive via a
    // bug, where this index turns it into a 23505 the service maps to 409.
    uniqueIndex('project_stages_one_active').on(table.projectId).where(sql`status = 'active'`),
  ],
);

export const projectStagesRelations = relations(projectStages, ({ one }) => ({
  project: one(projects, {
    fields: [projectStages.projectId],
    references: [projects.id],
  }),
  workflowStage: one(workflowStages, {
    fields: [projectStages.workflowStageId],
    references: [workflowStages.id],
  }),
  starter: one(users, {
    fields: [projectStages.startedBy],
    references: [users.id],
  }),
  completer: one(users, {
    fields: [projectStages.completedBy],
    references: [users.id],
  }),
}));
