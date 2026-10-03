import type { submissionVersions, submissions } from '../../schema/index.js';
import type { PublicUser, UserRow } from '../users/types.js';

export type SubmissionRow = typeof submissions.$inferSelect;
export type SubmissionVersionRow = typeof submissionVersions.$inferSelect;
export type SubmissionStatus = SubmissionRow['status'];

/** Row joined with its author (detail + list responses, §11.5). */
export interface SubmissionWithSubmitter extends SubmissionRow {
  submitter: UserRow;
}

/** The API shape of a submission — row plus the author as a PublicUser. */
export interface SubmissionView {
  id: string;
  projectId: string;
  milestoneId: string | null;
  submittedBy: string;
  title: string;
  status: SubmissionStatus;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  submitter: PublicUser;
}

/**
 * The API shape of one immutable version (§5.5, §12 I7).
 *
 * Exactly one of `body` / `originalFilename` is populated (§14.2): a text
 * chapter entered in the browser carries `body`, an uploaded artefact carries
 * the file trio. `storage_key` is deliberately absent — it is a server-side
 * path and never leaves the API (§14.3).
 */
export interface SubmissionVersionView {
  id: string;
  submissionId: string;
  versionNumber: number;
  body: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedBy: string;
  createdAt: Date;
}

export interface SubmissionListFilters {
  /** `?milestoneId=` — restrict to one milestone of the project. */
  milestoneId?: string;
  /** `?status=` — the `submission_status` enum member. */
  status?: SubmissionStatus;
}

/**
 * The multipart file, structurally compatible with `Express.Multer.File` but
 * without Express types — the service signature stays framework-free.
 */
export interface UploadedFile {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
}
