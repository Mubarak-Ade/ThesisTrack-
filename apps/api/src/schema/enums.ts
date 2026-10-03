import { pgEnum } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['student', 'supervisor', 'administrator']);

export const projectStatusEnum = pgEnum('project_status', ['active', 'completed', 'archived']);

export const proposalStatusEnum = pgEnum('proposal_status', [
  'draft',
  'submitted',
  'under_review',
  'revision_required',
  'approved',
  'rejected',
]);

export const submissionStatusEnum = pgEnum('submission_status', [
  'draft',
  'submitted',
  'under_review',
  'revision_required',
  'approved',
  'rejected',
]);

export const reviewDecisionEnum = pgEnum('review_decision', [
  'approved',
  'revision_required',
  'rejected',
]);

// §8.9 — + 'proposal' (submitted / revision requested / approved) and
// + 'deadline' (approaching). The original six members could not express
// either without mislabelling them as 'general'.
export const notificationTypeEnum = pgEnum('notification_type', [
  'assignment',
  'submission',
  'review',
  'feedback',
  'milestone',
  'general',
  'proposal',
  'deadline',
]);

export const milestoneStatusEnum = pgEnum('milestone_status', [
  'pending',
  'in_progress',
  'submitted',
  'approved',
  'overdue',
]);

export const accountTokenTypeEnum = pgEnum('account_token_type', ['activation', 'password_reset']);

// §8.9 (2026-10-02 requirements change, FR-CW) — the three states of a
// materialised project stage. The partial unique index on
// project_stages(project_id) WHERE status='active' pins at most one 'active'
// row per project (I16); zero active rows is legal once the final stage
// completes. There is deliberately no 'rolled back' member (I17).
export const projectStageStatusEnum = pgEnum('project_stage_status', [
  'pending',
  'active',
  'completed',
]);
