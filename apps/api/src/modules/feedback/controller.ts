import { getFeedback, getProject, getSubmission } from '../../authz/index.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { respond } from '../../lib/response.js';
import type { CreateFeedbackInput, PatchFeedbackInput } from './schema.js';
import * as service from './service.js';

/*
 * Thin handlers: guards (validate → resource) already ran in routes.ts per
 * §9.4; feedback has no `requireRole` step — §4.5 grants create/edit/delete
 * to every role, narrowed only by participation and authorship.
 */

// GET /projects/:projectId/feedback — the project's own thread (§11.7).
export const listForProject = asyncHandler(async (req, res) => {
  respond(res, 200, { feedback: await service.listProjectFeedback(getProject(req).id) });
});

// POST /projects/:projectId/feedback — any participant may discuss.
export const createProject = asyncHandler(async (req, res) => {
  const input = req.body as CreateFeedbackInput;
  const feedback = await service.createFeedback(getProject(req), null, input, req.user!.id);
  respond(res, 201, { feedback });
});

// GET /submissions/:submissionId/feedback — that submission's thread.
export const listForSubmission = asyncHandler(async (req, res) => {
  respond(res, 200, { feedback: await service.listSubmissionFeedback(getSubmission(req).id) });
});

// POST /submissions/:submissionId/feedback — projectId derived, never sent.
export const createSubmission = asyncHandler(async (req, res) => {
  const input = req.body as CreateFeedbackInput;
  const feedback = await service.createFeedback(
    getProject(req),
    getSubmission(req).id,
    input,
    req.user!.id,
  );
  respond(res, 201, { feedback });
});

// PATCH /feedback/:feedbackId — author only (§4.5 "edit own").
export const patch = asyncHandler(async (req, res) => {
  const input = req.body as PatchFeedbackInput;
  respond(res, 200, { feedback: await service.patchFeedback(getFeedback(req), input) });
});

// DELETE /feedback/:feedbackId — author or administrator (§11.7).
export const remove = asyncHandler(async (req, res) => {
  respond(res, 200, { feedback: await service.deleteFeedback(getFeedback(req)) });
});
