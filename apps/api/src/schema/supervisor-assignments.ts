import { pgTable, uuid, timestamp, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users.js';
import { projects } from './projects.js';

export const supervisorAssignments = pgTable(
  'supervisor_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
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
    // Active-assignment constraint, enforced by the database itself:
    // at most ONE active (ended_at IS NULL) assignment per project.
    // Ended rows are unconstrained — history may repeat a supervisor
    // (rehire / undo), only two ACTIVE rows may never coexist.
    uniqueIndex('idx_supervisor_assignments_active_unique')
      .on(table.projectId)
      .where(sql`ended_at IS NULL`),
  ],
);

export const supervisorAssignmentsRelations = relations(supervisorAssignments, ({ one }) => ({
  project: one(projects, {
    fields: [supervisorAssignments.projectId],
    references: [projects.id],
  }),
  supervisor: one(users, {
    fields: [supervisorAssignments.supervisorId],
    references: [users.id],
  }),
}));
