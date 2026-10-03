import { db } from '../../config/db.js';
import { BusinessRuleError, NotFoundError } from '../../errors/index.js';
import { notify } from '../../lib/notify.js';
import { getSubmissionDetail } from '../submissions/service.js';
import type { SubmissionRow, SubmissionStatus, SubmissionView } from '../submissions/types.js';
import { findActiveSupervisorIdForStudent } from '../supervisor-assignments/service.js';
import { findUserById, toPublicUser } from '../users/service.js';
import type { UserRow } from '../users/types.js';
import type { CreateReviewInput } from './schema.js';
import * as repo from './repository.js';
import type {
  ProjectReviewView,
  ReviewRow,
  ReviewView,
  ReviewWithReviewer,
} from './types.js';

/* ----------------------------------------------------------- state (§5.5) */

/**
 * §11.6 input statuses — a review may land only while the submission is
 * `submitted`, `under_review` or `revision_required`.
 *
 * `under_review` has no HTTP writer for submissions (unlike proposals'
 * §11.3 `start-review`): §5.5's flow draws `submit → SUBMITTED → decision`
 * directly. The spec still lists the state as an accepted input, so it is
 * accepted here defensively — an out-of-band transition into it would work.
 */
export const REVIEW_INPUT_STATUSES = [
  'submitted',
  'under_review',
  'revision_required',
] as const satisfies readonly SubmissionStatus[];

/** The §11.6 refusal: wrong state for a review (422, path `status`). */
function reviewRefusal(status: SubmissionStatus): BusinessRuleError {
  return new BusinessRuleError(`Cannot 'review' while in status '${status}'`, [
    { path: 'status', message: `'review' is not permitted from status '${status}'` },
  ]);
}

function toReviewView(row: ReviewWithReviewer | (ReviewRow & { reviewer: UserRow })): ReviewView {
  return {
    id: row.id,
    proposalId: row.proposalId,
    submissionId: row.submissionId,
    decision: row.decision,
    comment: row.comment,
    createdAt: row.createdAt,
    reviewer: toPublicUser(row.reviewer),
  };
}

/* --------------------------------------------------------------- service */

/**
 * POST /submissions/:submissionId/reviews (§11.6, §5.5).
 *
 * One transaction: the review row, the submission's decision, and the
 * milestone side effect on `approved` — a decision recorded without its
 * consequences (or consequences without the history) would corrupt §5.5. The
 * submission update is conditional on the input statuses, so a concurrent
 * decision aborts the insert above it with the same 422.
 */
export async function createReview(
  submission: SubmissionRow,
  input: CreateReviewInput,
  reviewerId: string,
): Promise<{ review: ReviewView; submission: SubmissionView }> {
  // Reads before the transaction, the proposals convention: validation
  // errors abort before any row moves.
  const reviewer = await findUserById(reviewerId);
  if (!reviewer) {
    throw new NotFoundError('User'); // the reviewing account is gone
  }
  if (!(REVIEW_INPUT_STATUSES as readonly SubmissionStatus[]).includes(submission.status)) {
    throw reviewRefusal(submission.status);
  }

  // §15.2's recipients for what this transaction is about to do: the student
  // (always) and the assigned supervisor when the milestone completes.
  // Resolved before the unit per §15.4.
  const supervisorId = await findActiveSupervisorIdForStudent(submission.submittedBy);

  const created = await db.transaction(async (tx) => {
    const review = await repo.insertReview(
      {
        submissionId: submission.id,
        reviewerId,
        decision: input.decision,
        comment: input.comment ?? null,
      },
      tx,
    );

    const updated = await repo.applyDecisionIfReviewable(
      submission.id,
      input.decision,
      REVIEW_INPUT_STATUSES,
      tx,
    );
    if (!updated) {
      throw reviewRefusal(submission.status); // rolls the insert back
    }

    // §15.2 "Submission reviewed → student", same transaction as the decision
    // (§15.4) — every decision announces itself, not just the approvals.
    await notify(
      {
        userId: submission.submittedBy,
        type: 'review',
        title: 'Submission reviewed',
        message: `Your submission "${submission.title}" was reviewed: ${input.decision.replace(/_/g, ' ')}.`,
        resourceType: 'submission',
        resourceId: submission.id,
      },
      tx,
    );

    // §5.5: approved → the tied milestone becomes approved with completedAt
    // set. A submission with no milestone simply skips this half.
    if (input.decision === 'approved' && updated.milestoneId) {
      const completed = await repo.approveMilestoneIfPending(updated.milestoneId, tx);
      if (completed) {
        // §15.2 "Milestone completed → supervisor + student": §5.5's side
        // effect completes milestones too, so this path fires the trigger
        // exactly as milestones/changeStatus does — a row only when the
        // status actually flipped (the repo returns it conditionally).
        for (const userId of [submission.submittedBy, supervisorId]) {
          if (!userId) continue;
          await notify(
            {
              userId,
              type: 'milestone',
              title: 'Milestone completed',
              message: `Milestone "${completed.title}" has been completed.`,
              resourceType: 'milestone',
              resourceId: completed.id,
            },
            tx,
          );
        }
      }
    }

    return review;
  });

  return {
    review: toReviewView({ ...created, reviewer }),
    submission: await getSubmissionDetail(submission.id),
  };
}

/** GET /submissions/:submissionId/reviews — append-only history, newest first. */
export async function listReviewsForSubmission(submissionId: string): Promise<ReviewView[]> {
  const rows = await repo.listReviewsForSubmission(submissionId);
  return rows.map(toReviewView);
}

/**
 * GET /projects/:projectId/reviews — the cross-submission history (§11.6),
 * newest first, each entry carrying its submission.
 */
export async function listReviewsForProject(projectId: string): Promise<ProjectReviewView[]> {
  const rows = await repo.listReviewsForProject(projectId);
  return rows.map((row) => ({
    ...toReviewView({ ...row.review, reviewer: row.reviewer }),
    submission: {
      id: row.submission.id,
      title: row.submission.title,
      status: row.submission.status,
    },
  }));
}
