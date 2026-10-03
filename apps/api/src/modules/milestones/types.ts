import type { milestoneTemplates, milestones } from '../../schema/index.js';

export type MilestoneRow = typeof milestones.$inferSelect;
export type MilestoneTemplateRow = typeof milestoneTemplates.$inferSelect;

/** The stored `milestone_status` members a request may target (§11.4). */
export type MilestoneStatus = 'pending' | 'in_progress' | 'submitted' | 'approved';

/**
 * §5.6's five milestone *states*. Four are stored; `overdue` is computed at
 * read time (never written — a stored value would need a cron and would
 * drift, §5.6).
 */
export type MilestoneState = MilestoneStatus | 'overdue';

/** Row + §5.6 computed fields, as every milestone endpoint returns it. */
export interface MilestoneView extends MilestoneRow {
  /** `due_at < now() AND status ≠ approved` — computed, never stored. */
  overdue: boolean;
  /** §5.6's canonical state: `overdue` overrides the stored status. */
  state: MilestoneState;
}

/** The JSONB `items` shape §8.5 pins (ADR-05). */
export interface MilestoneTemplateItem {
  title: string;
  description: string | null;
  dueOffsetDays: number;
}
