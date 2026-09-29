import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { submissions } from './submissions.js';
import { users } from './users.js';

/**
 * Immutable versions of a submission (§12 I7): a version is created and then
 * never modified or deleted — there is no update or delete route.
 *
 * Exactly one of `body` / `storageKey` (§14.2):
 *   - a text-first milestone is entered in the browser → `body`
 *   - a dataset, diagram or document is uploaded        → `storageKey`
 * Forcing a file upload would be wrong for text milestones; forcing text would
 * be wrong for binary artefacts. The CHECK makes it impossible to persist both
 * or neither.
 */
export const submissionVersions = pgTable(
  'submission_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => submissions.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    // Text chapter entered in the browser (§14.2).
    body: text('body'),
    // null when `body` is used instead (§14.3 — path relative to the uploads root).
    storageKey: text('storage_key'),
    originalFilename: varchar('original_filename', { length: 255 }),
    mimeType: varchar('mime_type', { length: 100 }),
    sizeBytes: integer('size_bytes'),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_submission_versions_submission_id').on(table.submissionId),
    index('idx_submission_versions_uploaded_by').on(table.uploadedBy),
    uniqueIndex('idx_submission_versions_unique').on(table.submissionId, table.versionNumber),
    // Exactly one of body / storage_key (§14.2) — never both, never neither.
    check('submission_versions_one_of', sql`num_nonnulls(body, storage_key) = 1`),
  ],
);

export const submissionVersionsRelations = relations(submissionVersions, ({ one }) => ({
  submission: one(submissions, {
    fields: [submissionVersions.submissionId],
    references: [submissions.id],
  }),
  uploader: one(users, {
    fields: [submissionVersions.uploadedBy],
    references: [users.id],
  }),
}));
