import { Clock3 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatDue } from '@/lib/utils/time';

/**
 * §16.5 deadline chip — relative text computed against `now`, `overdue`
 * never stored (§5.6). Renders nothing for an unknown deadline.
 */
export default function DeadlineChip({
  dueAt,
  className,
}: {
  dueAt: string | null;
  className?: string;
}) {
  const { label, overdue } = formatDue(dueAt);
  if (!label) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        overdue ? 'bg-danger-bg text-danger' : 'bg-surface-alt text-foreground',
        className,
      )}
    >
      <Clock3 className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}
