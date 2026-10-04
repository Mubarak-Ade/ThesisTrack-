/**
 * §5.6 progress derivation — shared by the student dashboard (State 5) and
 * My Project's Overview (§16.5). Progress is *derived from milestones, never
 * stored*, so this module is pure: rows in, summary out, computed at read.
 */

export type MilestoneStatus = 'pending' | 'in_progress' | 'submitted' | 'approved' | 'overdue';

export interface MilestoneRef {
  id: string;
  title: string;
  /** §5.6 canonical state — `overdue` is computed by the API at read time. */
  status: MilestoneStatus;
  dueAt: string | null;
  position: number;
}

export interface MilestoneSummary {
  approved: number;
  total: number;
  /** 0…100 — `approved / total`, the only percentage the UI may show (§16.5). */
  percent: number;
  /** First non-approved milestone in `position` order — "current milestone". */
  current: MilestoneRef | null;
  /** Nearest `dueAt` among non-approved milestones — the deadline chip. */
  nearest: MilestoneRef | null;
}

function byPosition(a: MilestoneRef, b: MilestoneRef): number {
  return a.position - b.position;
}

export function summariseMilestones(rows: MilestoneRef[]): MilestoneSummary {
  const sorted = [...rows].sort(byPosition);
  const approved = sorted.filter((row) => row.status === 'approved').length;
  const total = sorted.length;
  const open = sorted.filter((row) => row.status !== 'approved');

  const nearest =
    open
      .filter((row) => row.dueAt !== null)
      .sort(
        (a, b) => new Date(a.dueAt as string).getTime() - new Date(b.dueAt as string).getTime(),
      )[0] ?? null;

  return {
    approved,
    total,
    percent: total === 0 ? 0 : Math.round((approved / total) * 100),
    current: open[0] ?? null,
    nearest,
  };
}
