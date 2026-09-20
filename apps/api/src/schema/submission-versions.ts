import { pgTable, uuid, varchar, text, timestamp, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { submissions } from './submissions.js';
import { users } from './users.js';

export const submissionVersions = pgTable(
  'submission_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => submissions.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    storageKey: text('storage_key').notNull(),
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
