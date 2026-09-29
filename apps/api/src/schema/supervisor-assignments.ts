import { pgTable, uuid, timestamp, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users.js';
import { projects } from './projects.js';

/**
 * A row means: "Supervisor X supervises Student Y", with `projectId` as
 * context attached once the project exists (spec §8.2, ADR-12).
 *
 * `projectId` is nullable so an assignment can exist *before* a project does —
 * §9 requires the supervisor to be in place before the proposal is submitted
 * to them (ADR-13). The project is back-filled inside the approval
 * transaction (§5.4).
 *
 * Cardinality (spec §6.2 corollary, invariant I13/I14 pair):
 *   - student → at MOST ONE active supervisor  (unique index below)
 *   - supervisor → MANY students               (deliberately no unique on
 *                                               supervisor_id; a supervisor
 *                                               must be able to take a second
 *                                               student)
 * Every conflict check on this table must therefore be keyed on `studentId`.
 */
export const supervisorAssignments = pgTable(
  'supervisor_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    supervisorId: uuid('supervisor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    isPrimary: boolean('is_primary').notNull().default(false),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    // Which admin created this assignment (null = system/seed). SET NULL so
    // the history record survives account deletion.
    assignedBy: uuid('assigned_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_supervisor_assignments_project_id').on(table.projectId),
    index('idx_supervisor_assignments_supervisor_id').on(table.supervisorId),
    index('idx_supervisor_assignments_student_id').on(table.studentId),

    // I13 — at most ONE active assignment per STUDENT. This is the constraint
    // that makes "a student can only have one supervisor" a database fact
    // rather than a service-layer promise.
    uniqueIndex('idx_supervisor_assignments_active_student')
      .on(table.studentId)
      .where(sql`ended_at IS NULL`),

    // At most one active assignment per PROJECT, kept for the project-scoped
    // path — but partial so a project-less (pre-approval) row is exempt.
    // Supersedes idx_supervisor_assignments_active_unique (spec §8.2).
    uniqueIndex('idx_supervisor_assignments_active_project')
      .on(table.projectId)
      .where(sql`ended_at IS NULL AND project_id IS NOT NULL`),
  ],
);

export const supervisorAssignmentsRelations = relations(supervisorAssignments, ({ one }) => ({
  student: one(users, {
    fields: [supervisorAssignments.studentId],
    references: [users.id],
  }),
  project: one(projects, {
    fields: [supervisorAssignments.projectId],
    references: [projects.id],
  }),
  supervisor: one(users, {
    fields: [supervisorAssignments.supervisorId],
    references: [users.id],
  }),
}));
