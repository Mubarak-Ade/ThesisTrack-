import { db } from '../../config/db.js';
import { NotFoundError, ValidationError } from '../../errors/index.js';
import { notify } from '../../lib/notify.js';
import { htmlToText, sanitizeProposalBody } from '../../lib/sanitize.js';
import type { ProjectRow } from '../projects/types.js';
import { findActiveSupervisorIdForStudent } from '../supervisor-assignments/service.js';
import { findUserById, toPublicUser } from '../users/service.js';
import type { CreateFeedbackInput, PatchFeedbackInput } from './schema.js';
import * as repo from './repository.js';
import type { FeedbackRow, FeedbackView, FeedbackWithAuthor } from './types.js';

/**
 * ADR-14, applied to discussion exactly as it is applied to proposal and
 * submission content: sanitize on every write. A body whose text is empty
 * after cleaning is *not* content — it never becomes a row.
 */
function normalizeBody(dirty: string): string {
  const clean = sanitizeProposalBody(dirty);
  if (htmlToText(clean).trim() === '') {
    throw new ValidationError('Feedback body is empty', [
      { path: 'body', message: 'Body is empty' },
    ]);
  }
  return clean;
}

function toView(row: FeedbackRow & { author: FeedbackWithAuthor['author'] }): FeedbackView {
  return {
    id: row.id,
    projectId: row.projectId,
    submissionId: row.submissionId,
    body: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    author: toPublicUser(row.author),
  };
}

/** Typed accessor for the guard-loaded row (§9.3 — the service owns access). */
export function getFeedbackRow(id: string): Promise<FeedbackWithAuthor | undefined> {
  return repo.findFeedbackById(id);
}

/* --------------------------------------------------------------- service */

/**
 * POST — project- or submission-scoped (§11.7). The caller has already been
 * authorized against the target (any participant); `authorId` comes from the
 * token, never from the body.
 *
 * §15.2's "New feedback → author's counterparties": the project's student and
 * its assigned supervisor, **minus the author** — the two parties of the
 * project's discussion, never a broadcast (§15.4). An administrator who did
 * not author the row is an overseer rather than a party and hears nothing;
 * an administrator who *did* author it leaves exactly the student/supervisor
 * pair to notify.
 */
export async function createFeedback(
  project: ProjectRow,
  submissionId: string | null,
  input: CreateFeedbackInput,
  authorId: string,
): Promise<FeedbackView> {
  const author = await findUserById(authorId);
  if (!author) {
    throw new ValidationError('Unknown author', [{ path: 'authorId', message: 'User not found' }]);
  }
  const body = normalizeBody(input.body);

  // Recipients resolved before the unit (§15.4), deduped, author removed.
  const supervisorId = await findActiveSupervisorIdForStudent(project.studentId);
  const counterparties = [project.studentId, supervisorId].filter(
    (id): id is string => Boolean(id) && id !== authorId,
  );

  const row = await db.transaction(async (tx) => {
    const created = await repo.insertFeedback(
      { projectId: project.id, submissionId, authorId, body },
      tx,
    );
    for (const userId of new Set(counterparties)) {
      await notify(
        {
          userId,
          type: 'feedback',
          title: 'New feedback',
          message: `New feedback was posted on "${project.title}".`,
          resourceType: submissionId ? 'submission' : 'project',
          resourceId: submissionId ?? project.id,
        },
        tx,
      );
    }
    return created;
  });
  return toView({ ...row, author });
}

/** PATCH /feedback/:feedbackId — author only (§4.5, enforced by the guard). */
export async function patchFeedback(
  feedback: FeedbackWithAuthor,
  input: PatchFeedbackInput,
): Promise<FeedbackView> {
  const body = normalizeBody(input.body);
  const updated = await repo.updateFeedback(feedback.id, body);
  if (!updated) {
    throw new NotFoundError('Feedback'); // deleted between the guard and here
  }
  return toView({ ...updated, author: feedback.author });
}

/** DELETE /feedback/:feedbackId — author or administrator (§11.7). */
export async function deleteFeedback(feedback: FeedbackWithAuthor): Promise<FeedbackView> {
  await repo.deleteFeedback(feedback.id);
  return toView(feedback);
}

/** GET — project thread (submission-less rows) or one submission's thread. */
export const listProjectFeedback = async (projectId: string): Promise<FeedbackView[]> =>
  (await repo.listProjectFeedback(projectId)).map(toView);
export const listSubmissionFeedback = async (submissionId: string): Promise<FeedbackView[]> =>
  (await repo.listSubmissionFeedback(submissionId)).map(toView);
