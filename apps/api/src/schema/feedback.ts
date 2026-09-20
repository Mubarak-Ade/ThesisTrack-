import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { projects } from './projects.js';
import { submissions } from './submissions.js';
import { users } from './users.js';

export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    submissionId: uuid('submission_id').references(() => submissions.id, {
      onDelete: 'cascade',
    }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_feedback_project_id').on(table.projectId),
    index('idx_feedback_submission_id').on(table.submissionId),
    index('idx_feedback_author_id').on(table.authorId),
  ],
);

export const feedbackRelations = relations(feedback, ({ one }) => ({
  project: one(projects, {
    fields: [feedback.projectId],
    references: [projects.id],
  }),
  submission: one(submissions, {
    fields: [feedback.submissionId],
    references: [submissions.id],
  }),
  author: one(users, {
    fields: [feedback.authorId],
    references: [users.id],
  }),
}));
