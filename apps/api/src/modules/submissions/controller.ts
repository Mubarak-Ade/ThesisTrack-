import { getProject, getSubmission, getSubmissionVersionRow } from '../../authz/index.js';
import { ValidationError } from '../../errors/index.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { respond } from '../../lib/response.js';
import { attachmentDisposition, commitUpload } from '../../lib/storage.js';
import type {
  CreateSubmissionInput,
  ListSubmissionsQuery,
  PatchSubmissionInput,
} from './schema.js';
import * as service from './service.js';

/*
 * Thin handlers: guards (RBAC → validate → resource → workflow) already ran
 * in routes.ts per §9.4; each handler resolves what the guard cached and
 * delegates the business rules to the service.
 */

// GET /projects/:projectId/submissions — §11.5 `?milestoneId&status`.
export const list = asyncHandler(async (req, res) => {
  const query = req.query as unknown as ListSubmissionsQuery;
  respond(res, 200, { submissions: await service.listSubmissionsFor(getProject(req), query) });
});

// POST /submissions — student's own draft; JSON `body` or multipart file.
export const create = asyncHandler(async (req, res) => {
  const input = req.body as CreateSubmissionInput;
  const submission = await service.createSubmission(req.user!, input, req.file);
  if (req.file) {
    commitUpload(req); // the row owns the bytes now — suppress cleanup
  }
  respond(res, 201, { submission });
});

// GET /submissions/:submissionId — owner / assigned supervisor / admin.
export const show = asyncHandler(async (req, res) => {
  respond(res, 200, { submission: await service.getSubmissionDetail(getSubmission(req).id) });
});

// PATCH /submissions/:submissionId — the owner edits a draft (§11.5).
export const patch = asyncHandler(async (req, res) => {
  const input = req.body as PatchSubmissionInput;
  respond(res, 200, { submission: await service.patchSubmission(getSubmission(req), input) });
});

// POST /submissions/:submissionId/submit — draft → submitted (§5.5).
export const submit = asyncHandler(async (req, res) => {
  const submission = getSubmission(req);
  respond(res, 201, { submission: await service.submitSubmission(submission, req.user!.id) });
});

// POST /submissions/:submissionId/versions — multipart file OR JSON body.
export const appendVersion = asyncHandler(async (req, res) => {
  const body = (req.body as { body?: string }).body;

  // Exactly one of the two (§14.2's exclusive-or), checked here because only
  // now — after multer — does the request reveal which half it carried.
  if (req.file && body !== undefined) {
    throw new ValidationError('Send either a file or a body, not both', [
      { path: 'file', message: 'A body was also supplied' },
    ]);
  }
  if (!req.file && body === undefined) {
    throw new ValidationError('A file or a body is required', [
      { path: 'file', message: 'No file uploaded and no body supplied' },
    ]);
  }

  const result = await service.appendVersion(getSubmission(req), { file: req.file, body }, req.user!.id);
  if (req.file) {
    commitUpload(req); // the row owns the bytes now — suppress cleanup
  }
  respond(res, 201, { submission: result.submission, version: result.version });
});

// GET /submissions/:submissionId/versions — immutable history, newest first.
export const listVersions = asyncHandler(async (req, res) => {
  respond(res, 200, { versions: await service.listVersionsFor(getSubmission(req).id) });
});

// GET /submission-versions/:versionId/download — §14.5 headers, no static.
export const download = asyncHandler(async (req, res) => {
  const file = await service.openVersion(getSubmissionVersionRow(req));

  // An aborted download must not leave the file descriptor open (§14.4
  // cleanup applies to reads as much as writes).
  res.on('close', () => file.stream.destroy());

  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Length', String(file.sizeBytes));
  res.setHeader('Content-Disposition', attachmentDisposition(file.originalFilename));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  file.stream.pipe(res);
});

// DELETE /submissions/:submissionId — draft only, files in the same tx (§14.6).
export const remove = asyncHandler(async (req, res) => {
  respond(res, 200, { submission: await service.deleteSubmission(getSubmission(req)) });
});
