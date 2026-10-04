/**
 * §16.5 status chips — the same tone system My Project uses, scoped to this
 * feature (feature isolation keeps supervision off `@/features/**`).
 */
import type { MilestoneState, SubmissionStatus } from '../data/types';

export const SUBMISSION_STYLE: Record<SubmissionStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'border-border bg-surface-alt text-muted-foreground' },
  submitted: { label: 'Submitted', className: 'border-primary/30 bg-primary/10 text-primary' },
  under_review: {
    label: 'Under review',
    className: 'border-primary/30 bg-primary/10 text-primary',
  },
  revision_required: {
    label: 'Revision required',
    className: 'border-warning/40 bg-warning-bg text-warning',
  },
  approved: { label: 'Approved', className: 'border-success/40 bg-success-bg text-success' },
  rejected: { label: 'Rejected', className: 'border-danger/40 bg-danger-bg text-danger' },
};

export const MILESTONE_STYLE: Record<MilestoneState, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'border-border bg-surface-alt text-muted-foreground' },
  in_progress: {
    label: 'In progress',
    className: 'border-primary/30 bg-primary/10 text-primary',
  },
  submitted: {
    label: 'Awaiting approval',
    className: 'border-warning/40 bg-warning-bg text-warning',
  },
  approved: { label: 'Approved', className: 'border-success/40 bg-success-bg text-success' },
  overdue: { label: 'Overdue', className: 'border-danger/40 bg-danger-bg text-danger' },
};

export const DECISION_STYLE: Record<
  'approved' | 'revision_required' | 'rejected',
  { label: string; className: string }
> = {
  approved: { label: 'Approved', className: 'border-success/40 bg-success-bg text-success' },
  revision_required: {
    label: 'Revision required',
    className: 'border-warning/40 bg-warning-bg text-warning',
  },
  rejected: { label: 'Rejected', className: 'border-danger/40 bg-danger-bg text-danger' },
};
