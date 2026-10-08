/**
 * §16.2 student dashboard states — the pure resolver (task 11.1).
 *
 * No fetching, no React: given the three reads the dashboard makes, decide
 * which of the six table rows applies. Every screen branch flows from here,
 * so the unit tests below are the §16.2 table itself, row by row.
 *
 * Proposal precedence when a student has several rows (the API's I4 keeps at
 * most one *in-flight*, so the only mixes are in-flight + terminal):
 *   1. pending in-flight first — revision_required (student must act) >
 *      submitted/under_review (waiting on supervisor);
 *   2. then approved (State 5 — a later stray draft cannot hide an approval:
 *      `approved + project` is the table's own condition for State 5);
 *   3. then a draft (State 1's PROPOSED slot, "Continue Draft");
 *   4. then rejected (State 4);
 *   5. nothing → State 1.
 */

export const PROPOSAL_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'revision_required',
  'approved',
  'rejected',
] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export interface ProposalRef {
  id: string;
  title: string;
  status: ProposalStatus;
  updatedAt: string;
}

export interface ProjectRef {
  id: string;
  title: string;
  status: string;
}

export interface SupervisorRef {
  firstName: string;
  lastName: string;
  email: string;
}

export interface StudentStateInput {
  /** `GET /students/:id/supervisor` → `{active, history}` (active null = State 0). */
  hasActiveSupervisor: boolean;
  supervisor: SupervisorRef | null;
  proposals: ProposalRef[];
  projects: ProjectRef[];
}

export type StudentState = 0 | 1 | 2 | 3 | 4 | 5;

export interface StudentStateResult {
  state: StudentState;
  /** True when State 1's slot holds a *draft* — copy switches to "continue". */
  hasDraft: boolean;
  proposal: ProposalRef | null;
  project: ProjectRef | null;
  supervisor: SupervisorRef | null;
}

/** Per-row ranking inside the in-flight group (lower = surfaced first). */
function inFlightRank(status: ProposalStatus): number {
  switch (status) {
    case 'revision_required':
      return 0;
    case 'submitted':
    case 'under_review':
      return 1;
    case 'draft':
      return 2;
    default:
      return 9;
  }
}

function newest(a: ProposalRef, b: ProposalRef): number {
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
}

function pickInFlight(proposals: ProposalRef[]): ProposalRef | null {
  const inFlight = proposals.filter((p) =>
    ['draft', 'submitted', 'under_review', 'revision_required'].includes(p.status),
  );
  if (inFlight.length === 0) return null;
  return [...inFlight].sort((a, b) => inFlightRank(a.status) - inFlightRank(b.status) || newest(a, b))[0];
}

/** §16.2 — the six rows, in the table's own terms. */
export function resolveStudentState(input: StudentStateInput): StudentStateResult {
  const project = input.projects.length > 0 ? input.projects[0] : null;
  const supervisor = input.supervisor;

  if (!input.hasActiveSupervisor) {
    return { state: 0, hasDraft: false, proposal: null, project: null, supervisor: null };
  }

  const inFlight = pickInFlight(input.proposals);
  const approved = input.proposals.find((p) => p.status === 'approved') ?? null;

  // Genuinely pending rows outrank everything: the student must revise, or the
  // supervisor is still reviewing (I4 keeps at most one such row anyway).
  if (inFlight && inFlight.status !== 'draft') {
    const state: StudentState = inFlight.status === 'revision_required' ? 3 : 2;
    return { state, hasDraft: false, proposal: inFlight, project, supervisor };
  }

  // State 5 next — a stray later draft must not hide an approval.
  if (approved) {
    return { state: 5, hasDraft: false, proposal: approved, project, supervisor };
  }

  // Draft alone → State 1's PROPOSED slot ("Continue Draft").
  if (inFlight) {
    return { state: 1, hasDraft: true, proposal: inFlight, project, supervisor };
  }

  const rejected = [...input.proposals].sort(newest).find((p) => p.status === 'rejected') ?? null;
  if (rejected) {
    return { state: 4, hasDraft: false, proposal: rejected, project, supervisor };
  }

  return { state: 1, hasDraft: false, proposal: null, project, supervisor };
}
