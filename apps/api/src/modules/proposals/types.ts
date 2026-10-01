import type { milestoneTemplates, proposalAttachments, proposals, reviews } from '../../schema/index.js';
import type { PublicUser, UserRow } from '../users/types.js';

export type ProposalRow = typeof proposals.$inferSelect;
export type ProposalAttachmentRow = typeof proposalAttachments.$inferSelect;
export type ReviewRow = typeof reviews.$inferSelect;
export type MilestoneTemplateRow = typeof milestoneTemplates.$inferSelect;

export type ProposalStatus = ProposalRow['status'];
export type ReviewDecision = ReviewRow['decision'];

/** Row joined with its author (detail + list responses, §11.3). */
export interface ProposalWithStudent extends ProposalRow {
  student: UserRow;
}

/** The API shape of a proposal — row plus the author as a PublicUser. */
export interface ProposalView {
  id: string;
  studentId: string;
  /** Null until the §5.4 approval transaction materialises the project. */
  projectId: string | null;
  version: number;
  title: string;
  abstract: string;
  /** Sanitized editor HTML (ADR-14), or null when the document is an upload. */
  body: string | null;
  status: ProposalStatus;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  student: PublicUser;
}

export interface ProposalAttachmentView {
  id: string;
  proposalId: string;
  /** I14: the proposal version this file was uploaded under. */
  proposalVersion: number;
  /** Client-supplied name, kept for display only (§14.4). */
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: Date;
}

/** One append-only review row (§12 I8) with its reviewer. */
export interface ReviewView {
  id: string;
  proposalId: string | null;
  submissionId: string | null;
  decision: ReviewDecision;
  comment: string | null;
  createdAt: Date;
  reviewer: PublicUser;
}

export interface ProposalListFilters {
  /**
   * Scope: only these students' proposals. Set by the service from the
   * requester (own id, verified caseload member); `undefined` = any student
   * (administrator). Never empty — callers return early instead.
   */
  studentIds?: string[];
  /** Explicit `?studentId=` filter (administrator only; others pre-authorized). */
  studentId?: string;
  status?: ProposalStatus;
  page: number;
  limit: number;
}

export interface ProposalListPage {
  proposals: ProposalView[];
  total: number;
}

/**
 * The multipart file, structurally compatible with `Express.Multer.File` but
 * without Express types — the service signature stays framework-free.
 */
export interface UploadedFile {
  path: string;
  filename: string;
  originalname: string;
  mimetype: string;
  size: number;
}

/** The approval transaction's product (§5.4 step 1). */
export interface ProjectRowLite {
  id: string;
  studentId: string;
  title: string;
  description: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}
