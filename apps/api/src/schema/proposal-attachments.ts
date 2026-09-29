import { pgTable, uuid, varchar, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { proposals } from './proposals.js';
import { users } from './users.js';

/**
 * Uploaded PDF/Word proposal documents (spec §8.3, §11.3, ADR-14).
 *
 * `proposalVersion` is copied from `proposals.version` **at upload time**,
 * which is what makes invariant I14 enforceable without locks: submitting
 * increments `proposals.version`, so the previous version's file set is
 * frozen simply by virtue of being tagged with a number that no longer
 * matches. Nothing is overwritten — v1 and v2 documents both stay retrievable.
 *
 * Every file column is NOT NULL: a row here *is* a file. The
 * "type it instead of uploading" case is `proposals.body`, never an attachment.
 *
 * This is deliberately NOT a generic/polymorphic `File` table — that remains
 * REJECTED (§6.1, ADR-06). Like `submission_versions`, it hangs off exactly one
 * entity, so it inherits that entity's workflow state and a single typed
 * authorization path (`resolveProposalAccess`, §13.3) instead of a polymorphic
 * lookup the resource guards cannot type.
 */
export const proposalAttachments = pgTable(
  'proposal_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    proposalId: uuid('proposal_id')
      .notNull()
      .references(() => proposals.id, { onDelete: 'cascade' }),
    // Frozen at upload time — see I14 above.
    proposalVersion: integer('proposal_version').notNull(),
    // Path relative to the uploads root (§14.3): uploads/proposals/<id>/v<n>-<uuid>.<ext>
    storageKey: text('storage_key').notNull(),
    originalFilename: varchar('original_filename', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    // restrict: accountability — who put this document on record.
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Drives "show the current version's files" and the I14 freeze check.
    index('idx_proposal_attachments_proposal').on(table.proposalId, table.proposalVersion),
  ],
);

export const proposalAttachmentsRelations = relations(proposalAttachments, ({ one }) => ({
  proposal: one(proposals, {
    fields: [proposalAttachments.proposalId],
    references: [proposals.id],
  }),
  uploader: one(users, {
    fields: [proposalAttachments.uploadedBy],
    references: [users.id],
  }),
}));
