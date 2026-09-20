import { pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.js';
import { projectStatusEnum } from './enums.js';

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    title: varchar('title', { length: 500 }).notNull(),
    description: text('description'),
    status: projectStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_projects_student_id').on(table.studentId),
    index('idx_projects_status').on(table.status),
  ],
);

export const projectsRelations = relations(projects, ({ one, many }) => ({
  student: one(users, {
    fields: [projects.studentId],
    references: [users.id],
  }),
  proposals: many(proposals),
  supervisorAssignments: many(supervisorAssignments),
  milestones: many(milestones),
  submissions: many(submissions),
  feedback: many(feedback),
}));

import { proposals } from './proposals.js';
import { supervisorAssignments } from './supervisor-assignments.js';
import { milestones } from './milestones.js';
import { submissions } from './submissions.js';
import { feedback } from './feedback.js';
