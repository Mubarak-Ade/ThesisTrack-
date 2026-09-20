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

export const notificationTypeEnum = pgEnum('notification_type', [
  'assignment',
  'submission',
  'review',
  'feedback',
  'milestone',
  'general',
]);

export const milestoneStatusEnum = pgEnum('milestone_status', [
  'pending',
  'in_progress',
  'submitted',
  'approved',
  'overdue',
]);
