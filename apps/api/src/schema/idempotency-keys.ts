import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.js';

/**
 * Replay protection for the five idempotent POSTs (spec §8.6, ADR-07,
 * §11.12).
 *
 * The `Idempotency-Key` header is OPTIONAL — an absent header bypasses this
 * table entirely, so existing clients are unaffected.
 *
 * Lifecycle: a request hashes to `requestHash`; on a repeat of the SAME
 * (key, user, endpoint) with the same hash, the stored `responseBody` is
 * replayed. The same key with a DIFFERENT hash is a client bug and returns
 * 409. Rows are swept once `expiresAt` passes (§11.12) — piggybacked on the
 * existing session cleanup rather than a scheduler (plan Phase 8.3).
 */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: varchar('key', { length: 255 }).notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: varchar('endpoint', { length: 255 }).notNull(),
    // sha256 hex of the canonicalised request body.
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    // null while the original request is still in flight (§11.12 returns 409
    // for that case rather than a stale response).
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    // The identity of a request: the same key from the same user to the same
    // endpoint. Two different users may legitimately reuse a key value.
    uniqueIndex('idx_idempotency_keys_unique').on(table.key, table.userId, table.endpoint),
    index('idx_idempotency_keys_expires_at').on(table.expiresAt),
  ],
);

export const idempotencyKeysRelations = relations(idempotencyKeys, ({ one }) => ({
  user: one(users, {
    fields: [idempotencyKeys.userId],
    references: [users.id],
  }),
}));
