import { Progress } from '@/components/ui/progress';

/**
 * §5.6 / §16.5 milestone bar — `approved / total`, derived, never a stored
 * or fabricated percentage. This answers "how much done"; the stage tracker
 * answers "where in the process" — they sit side by side (§3.4).
 */
export default function MilestoneBar({
  approved,
  total,
  percent,
  emptyHint = 'No milestones yet — your supervisor defines them when the project starts.',
}: {
  approved: number;
  total: number;
  percent: number;
  /** Student-voiced by default; supervisors pass their own wording (§16.3). */
  emptyHint?: string;
}) {
  if (total === 0) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Progress</h2>
        <p className="mt-2 text-sm text-muted-foreground">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">Progress</h2>
      <div className="mt-3 flex items-center gap-3">
        <Progress value={percent} className="flex-1" aria-label={`${percent}% complete`} />
        <span className="text-sm font-semibold text-foreground">{percent}%</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {approved} of {total} milestones approved
      </p>
    </div>
  );
}
