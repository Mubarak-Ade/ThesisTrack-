import { pgTable, uuid, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.js';
import { accountTokenTypeEnum } from './enums.js';

/**
 * Single-use, hashed tokens for account lifecycle flows:
 * - `activation`    — admin provisions an INVITED user, user sets password → ACTIVE
 * - `password_reset` — forgot-password flow
 *
 * Only the SHA-256 hash of the token is stored; `usedAt` enforces single use.
 */
export const accountTokens = pgTable(
  'account_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: accountTokenTypeEnum('type').notNull(),
    tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_account_tokens_user_id').on(table.userId),
    index('idx_account_tokens_expires_at').on(table.expiresAt),
  ],
);

export const accountTokensRelations = relations(accountTokens, ({ one }) => ({
  user: one(users, {
    fields: [accountTokens.userId],
    references: [users.id],
  }),
}));
