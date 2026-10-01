import { Router, type RequestHandler } from 'express';

import {
  requireAttachmentAccess,
  requireProposalAccess,
  requireRole,
  requireWorkflow,
} from '../../authz/index.js';
import { uploadProposalDocument } from '../../lib/storage.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';
import {
  attachmentParamsSchema,
  createProposalSchema,
  listProposalsQuerySchema,
  patchProposalSchema,
  proposalParamsSchema,
  reviewProposalSchema,
} from './schema.js';
import { PROPOSAL_ACTION_ROLES, PROPOSAL_TRANSITIONS, type ProposalAction } from './service.js';
import type { ProposalStatus } from './types.js';

const router = Router();

/**
 * Layer 3 on every mutating route (spec §13.1 — the first module to wire
 * `requireWorkflow` to real routes). The resource guard cached the proposal
 * on `req.proposal`, so the load is free; a missing guard degrades to 404.
 */
function proposalWorkflow(action: ProposalAction): RequestHandler {
  return requireWorkflow<ProposalStatus, ProposalAction>({
    resource: 'Proposal',
    load: async (req) => req.proposal,
    action,
    transitions: PROPOSAL_TRANSITIONS,
    roles: PROPOSAL_ACTION_ROLES,
  });
}

/*
 * §9.4 guard order, exactly:
 *   authenticate (global) → requireRole → validate(params) → validate(body)
 *   → resource guard → requireWorkflow → controller
 *
 * §11.3 access column drives `requireRole`/`allow`:
 *   create/edit/submit/attach/delete → student (owner)
 *   start-review/review              → assigned supervisor / admin
 *   reads                            → owner / assigned supervisor / admin
 */

/* ---------------------------------------------------------------- reads */

router.get('/proposals', validate(listProposalsQuerySchema, 'query'), controller.list);

router.get(
  '/proposals/:proposalId',
  validate(proposalParamsSchema, 'params'),
  requireProposalAccess(),
  controller.show,
);

router.get(
  '/proposals/:proposalId/attachments',
  validate(proposalParamsSchema, 'params'),
  requireProposalAccess(),
  controller.listAttachments,
);

router.get(
  '/proposals/:proposalId/reviews',
  validate(proposalParamsSchema, 'params'),
  requireProposalAccess(),
  controller.listReviews,
);

/* --------------------------------------------------------------- writes */

router.post('/proposals', requireRole('student'), validate(createProposalSchema), controller.create);

router.patch(
  '/proposals/:proposalId',
  requireRole('student'),
  validate(proposalParamsSchema, 'params'),
  validate(patchProposalSchema),
  requireProposalAccess({ allow: ['owner'] }),
  proposalWorkflow('patch'),
  controller.patch,
);

/*
 * Multipart: multer runs AFTER authorization + workflow (§9.4), so no byte
 * is written for a request that would have been refused — and the upload is
 * refused while the proposal is not in an editable state (I14).
 */
router.post(
  '/proposals/:proposalId/attachments',
  requireRole('student'),
  validate(proposalParamsSchema, 'params'),
  requireProposalAccess({ allow: ['owner'] }),
  proposalWorkflow('attach'),
  uploadProposalDocument,
  controller.attach,
);

router.delete(
  '/proposal-attachments/:attachmentId',
  requireRole('student'),
  validate(attachmentParamsSchema, 'params'),
  requireAttachmentAccess({ allow: ['owner'] }),
  proposalWorkflow('detach'),
  controller.removeAttachment,
);

router.get(
  '/proposal-attachments/:attachmentId/download',
  validate(attachmentParamsSchema, 'params'),
  requireAttachmentAccess(),
  controller.download,
);

router.post(
  '/proposals/:proposalId/submit',
  requireRole('student'),
  validate(proposalParamsSchema, 'params'),
  requireProposalAccess({ allow: ['owner'] }),
  proposalWorkflow('submit'),
  controller.submit,
);

router.post(
  '/proposals/:proposalId/start-review',
  requireRole('supervisor', 'administrator'),
  validate(proposalParamsSchema, 'params'),
  requireProposalAccess({ allow: ['supervisor', 'admin'] }),
  proposalWorkflow('start-review'),
  controller.startReview,
);

router.post(
  '/proposals/:proposalId/review',
  requireRole('supervisor', 'administrator'),
  validate(proposalParamsSchema, 'params'),
  validate(reviewProposalSchema),
  requireProposalAccess({ allow: ['supervisor', 'admin'] }),
  proposalWorkflow('review'),
  controller.review,
);

export default router;
