import { asyncHandler } from '../../lib/async-handler.js';
import { respond } from '../../lib/response.js';
import { attachmentDisposition, commitUpload } from '../../lib/storage.js';
import { ValidationError } from '../../errors/index.js';
import type {
  CreateProposalInput,
  ListProposalsQuery,
  PatchProposalInput,
  ProposalParams,
  ReviewProposalInput,
} from './schema.js';
import * as service from './service.js';

/*
 * Thin handlers: guards (RBAC → validate → resource → workflow) already ran
 * in routes.ts per §9.4; each handler resolves what the guard cached and
 * delegates the business rules to the service.
 */

// GET /proposals — scoped list for the requester (§11.3).
export const list = asyncHandler(async (req, res) => {
  const query = req.query as unknown as ListProposalsQuery;
  const { proposals, total } = await service.listProposalsFor(req.user!, query);
  respond(res, 200, {
    proposals,
    pagination: { page: query.page, limit: query.limit, total },
  });
});

// POST /proposals — student's own draft, v1; 409 while one is in flight (I4).
export const create = asyncHandler(async (req, res) => {
  const input = req.body as CreateProposalInput;
  const proposal = await service.createProposal(req.user!.id, input);
  respond(res, 201, { proposal });
});

// GET /proposals/:proposalId — owner / assigned supervisor / admin.
export const show = asyncHandler(async (req, res) => {
  const { proposalId } = req.params as ProposalParams;
  respond(res, 200, { proposal: await service.getProposalDetail(proposalId) });
});

// PATCH /proposals/:proposalId — the owner edits (draft | revision_required).
export const patch = asyncHandler(async (req, res) => {
  const input = req.body as PatchProposalInput;
  const proposal = await service.patchProposal(req.proposal!, input);
  respond(res, 200, { proposal });
});

// POST /proposals/:proposalId/attachments — multipart `file` (§14).
export const attach = asyncHandler(async (req, res) => {
  if (!req.file) {
    // multer only omits `req.file` when no part was sent — a shape problem.
    throw new ValidationError('A file is required', [
      { path: 'file', message: 'No file uploaded' },
    ]);
  }
  const attachment = await service.addAttachment(req.proposal!, req.file, req.user!.id);
  commitUpload(req); // the row owns the bytes now — suppress cleanup
  respond(res, 201, { attachment });
});

// GET /proposals/:proposalId/attachments — all versions (§11.3).
export const listAttachments = asyncHandler(async (req, res) => {
  const { proposalId } = req.params as ProposalParams;
  respond(res, 200, { attachments: await service.listAttachmentsFor(proposalId) });
});

// DELETE /proposal-attachments/:attachmentId — I14: draft | revision_required.
export const removeAttachment = asyncHandler(async (req, res) => {
  const attachment = await service.removeAttachment({
    attachment: req.proposalAttachment!,
    proposal: req.proposal!,
  });
  respond(res, 200, { attachment });
});

// GET /proposal-attachments/:attachmentId/download — §14.5 headers, no static.
export const download = asyncHandler(async (req, res) => {
  const file = await service.openAttachment(req.proposalAttachment!);

  // An aborted download must not leave the file descriptor open (§14.4
  // cleanup applies to reads as much as writes).
  res.on('close', () => file.stream.destroy());

  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Length', String(file.sizeBytes));
  res.setHeader('Content-Disposition', attachmentDisposition(file.originalFilename));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  file.stream.pipe(res);
});

// POST /proposals/:proposalId/submit — 422 without body AND attachments (§11.3).
export const submit = asyncHandler(async (req, res) => {
  const proposal = await service.submitProposal(req.proposal!);
  respond(res, 201, { proposal });
});

// POST /proposals/:proposalId/start-review — submitted → under_review.
export const startReview = asyncHandler(async (req, res) => {
  respond(res, 200, { proposal: await service.startReview(req.proposal!) });
});

// POST /proposals/:proposalId/review — approved runs the §5.4 transaction.
export const review = asyncHandler(async (req, res) => {
  const input = req.body as ReviewProposalInput;
  const result = await service.reviewProposal(req.proposal!, input, req.user!.id);
  respond(res, 200, { proposal: result.proposal, review: result.review, project: result.project });
});

// GET /proposals/:proposalId/reviews — append-only history (§12 I8).
export const listReviews = asyncHandler(async (req, res) => {
  const { proposalId } = req.params as ProposalParams;
  respond(res, 200, { reviews: await service.listReviewsFor(proposalId) });
});
