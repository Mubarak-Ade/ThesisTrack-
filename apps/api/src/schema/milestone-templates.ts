import { pgTable, uuid, varchar, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.js';

/**
 * Discipline-specific milestone workflows (spec §8.5, ADR-05).
 *
 * ONE table with a JSONB `items` column, not two. A normalised
 * `template_items` table was rejected: templates are read whole and edited
 * whole, so a join buys nothing (ADR-05).
 *
 * `items` shape:
 *   [{ "title": string, "description": string|null, "dueOffsetDays": number }]
 *
 * On project approval these are materialised into `milestones` with
 * `due_at = projects.created_at + dueOffsetDays` (§5.4 step 4).
 */
export const milestoneTemplates = pgTable('milestone_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  // Defaults to an empty list so a template can be created before it is filled.
  items: jsonb('items')
    .$type<Array<{ title: string; description: string | null; dueOffsetDays: number }>>()
    .notNull()
    .default([]),
  // SET NULL: the template outlives the account that authored it.
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const milestoneTemplatesRelations = relations(milestoneTemplates, ({ one }) => ({
  creator: one(users, {
    fields: [milestoneTemplates.createdBy],
    references: [users.id],
  }),
}));
