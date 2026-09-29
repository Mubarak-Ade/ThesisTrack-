import { pgTable, uuid, text, timestamp, index, check } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { submissions } from './submissions.js';
import { proposals } from './proposals.js';
import { users } from './users.js';
import { reviewDecisionEnum } from './enums.js';

/**
 * Append-only review history (§12 I8): rows are created, never updated or
 * deleted, and there is no UPDATE/DELETE route for them.
 *
 * A review targets exactly ONE thing — a submission or a proposal — which is
 * what the CHECK enforces. Before §5.4 it could only be a submission, hence
 * `submissionId` became nullable rather than being replaced.
 */
export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    submissionId: uuid('submission_id').references(() => submissions.id, {
      onDelete: 'cascade',
    }),
    proposalId: uuid('proposal_id').references(() => proposals.id, { onDelete: 'cascade' }),
    reviewerId: uuid('reviewer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    decision: reviewDecisionEnum('decision').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_reviews_submission_id').on(table.submissionId),
    index('idx_reviews_proposal_id').on(table.proposalId),
    index('idx_reviews_reviewer_id').on(table.reviewerId),
    // Exactly one target: a row that reviewed neither, or both, is meaningless.
    check('reviews_exactly_one_target', sql`num_nonnulls(proposal_id, submission_id) = 1`),
  ],
);

export const reviewsRelations = relations(reviews, ({ one }) => ({
  submission: one(submissions, {
    fields: [reviews.submissionId],
    references: [submissions.id],
  }),
  proposal: one(proposals, {
    fields: [reviews.proposalId],
    references: [proposals.id],
  }),
  reviewer: one(users, {
    fields: [reviews.reviewerId],
    references: [users.id],
  }),
}));
