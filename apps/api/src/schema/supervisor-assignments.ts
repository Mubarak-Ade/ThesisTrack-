import { pgTable, uuid, timestamp, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_supervisor_assignments_project_id').on(table.projectId),
    index('idx_supervisor_assignments_supervisor_id').on(table.supervisorId),
    uniqueIndex('idx_supervisor_assignments_unique').on(table.projectId, table.supervisorId),
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
