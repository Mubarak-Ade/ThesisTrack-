import { pgTable, uuid, varchar, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { projects } from './projects.js';
import { proposalStatusEnum } from './enums.js';

export const proposals = pgTable(
  'proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    version: integer('version').notNull().default(1),
    title: varchar('title', { length: 500 }).notNull(),
    abstract: text('abstract'),
    status: proposalStatusEnum('status').notNull().default('draft'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_proposals_project_id').on(table.projectId),
    index('idx_proposals_status').on(table.status),
  ],
);

export const proposalsRelations = relations(proposals, ({ one }) => ({
  project: one(projects, {
    fields: [proposals.projectId],
    references: [projects.id],
  }),
}));
