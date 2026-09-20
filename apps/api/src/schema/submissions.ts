import { pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { projects } from './projects.js';
import { milestones } from './milestones.js';
import { users } from './users.js';
import { submissionStatusEnum } from './enums.js';

export const submissions = pgTable(
  'submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    milestoneId: uuid('milestone_id').references(() => milestones.id, {
      onDelete: 'set null',
    }),
    submittedBy: uuid('submitted_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    title: varchar('title', { length: 500 }).notNull(),
    status: submissionStatusEnum('status').notNull().default('draft'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_submissions_project_id').on(table.projectId),
    index('idx_submissions_milestone_id').on(table.milestoneId),
    index('idx_submissions_submitted_by').on(table.submittedBy),
    index('idx_submissions_status').on(table.status),
  ],
);

export const submissionsRelations = relations(submissions, ({ one, many }) => ({
  project: one(projects, {
    fields: [submissions.projectId],
    references: [projects.id],
  }),
  milestone: one(milestones, {
    fields: [submissions.milestoneId],
    references: [milestones.id],
  }),
  submitter: one(users, {
    fields: [submissions.submittedBy],
    references: [users.id],
  }),
  versions: many(submissionVersions),
  reviews: many(reviews),
  feedback: many(feedback),
}));

import { submissionVersions } from './submission-versions.js';
import { reviews } from './reviews.js';
import { feedback } from './feedback.js';
