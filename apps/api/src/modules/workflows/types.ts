import type { projectStages, workflowStages, workflows } from '../../schema/index.js';

export type WorkflowRow = typeof workflows.$inferSelect;
export type WorkflowStageRow = typeof workflowStages.$inferSelect;
export type ProjectStageRow = typeof projectStages.$inferSelect;

/**
 * Views. Definition rows are returned as-is (identity views) — the API exposes
 * every column the row carries, exactly like `GET /projects/:projectId` does.
 * The two computed views below are the exceptions: `ProjectStageView` gains the
 * §8.11 computed `dueAt`/`overdue`, and the current stage gains `unmet` (§16.5
 * renders the disabled advance action from it without forcing a 422 probe).
 */
export type WorkflowView = WorkflowRow;
export type WorkflowStageView = WorkflowStageRow;

/**
 * One project stage as the API returns it: the frozen snapshot row plus the
 * §8.11 computed `dueAt`/`overdue` (never stored — §5.6 discipline).
 */
export interface ProjectStageView extends ProjectStageRow {
  dueAt: Date | null;
  overdue: boolean;
}

/** The active stage's view plus the currently unmet §11.14 gates. */
export interface CurrentStageView extends ProjectStageView {
  unmet: string[];
}

/** §11.14 `GET /projects/:projectId/stages` — FR-CW-05 tracker payload. */
export interface StageTracker {
  stages: ProjectStageView[];
  current: CurrentStageView | null;
}

/** Definition + ordered stages — the workflow detail payload (§11.14). */
export interface WorkflowDetail {
  workflow: WorkflowView;
  stages: WorkflowStageRow[];
}

/**
 * Facts the §11.14 gate table evaluates against. Split from the query so the
 * approval transaction (§5.4 step 5) can evaluate its stage-1 gates from facts
 * it already knows — the project is brand new inside the transaction, so a
 * query against it would read uncommitted state.
 */
export interface GateFacts {
  /** The project's proposal reached `approved` (§5.4) — the proposal branch. */
  proposalApproved: boolean;
  /** A submission exists for this project inside the stage window. */
  submissionInWindow: boolean;
  /** An in-window submission carries any review row. */
  reviewedSubmissionInWindow: boolean;
  /** An in-window submission carries a review with decision `approved`. */
  approvedReviewedSubmissionInWindow: boolean;
}

/** The three §11.14 gate flags — what `evaluateGates` reads (never state). */
export interface GateFields {
  requiresSubmission: boolean;
  requiresReview: boolean;
  requiresApproval: boolean;
}
