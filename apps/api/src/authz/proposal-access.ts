import type { AuthUser } from '../middleware/auth.js';
import { getActiveAssignmentForStudent } from '../modules/supervisor-assignments/service.js';

/**
 * Access level a user holds over a single proposal (spec §13.3).
 *
 * - `'owner'`      — the proposal's own student
 * - `'supervisor'` — that student's ACTIVE supervisor
 * - `'admin'`      — administrator
 * - `null`         — no relationship
 */
export type ProposalAccess = 'owner' | 'supervisor' | 'admin';

/**
 * **The rule this build exists to enforce:** every proposal-scoped
 * authorization resolves through `student_id`, never through `project_id`
 * (spec §13.3). A proposal can be read before its project exists — that is the
 * whole point of §8.3's nullable `project_id` — so a project-keyed lookup would
 * deny the student's own supervisor access to the very document they must review.
 *
 * `proposal.studentId` is NOT NULL, which is what makes this possible: no
 * project lookup, no null handling, one direct (student, supervisor) query.
 *
 * Evaluated in the order §13.3 documents. The three tests are mutually
 * exclusive by construction — a proposal's student cannot simultaneously be an
 * administrator holding an assignment with themselves — so the ordering is
 * documentation, not a tiebreak.
 */
export async function resolveProposalAccess(
  proposal: Pick<{ studentId: string }, 'studentId'>,
  user: AuthUser,
): Promise<ProposalAccess | null> {
  if (proposal.studentId === user.id) {
    return 'owner';
  }

  const assignment = await getActiveAssignmentForStudent(proposal.studentId, user.id);
  if (assignment) {
    return 'supervisor';
  }

  if (user.role === 'administrator') {
    return 'admin';
  }

  return null;
}
