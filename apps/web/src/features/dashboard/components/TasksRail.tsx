import { AlertTriangle, Clock, Zap } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { CriticalTask, TaskGroups, TaskItem, TaskKind } from '../data/types';

const GROUP_STYLES: Record<
  TaskKind,
  { label: string; chipClass: string; icon: typeof Clock }
> = {
  UPCOMING: { label: 'Upcoming', chipClass: 'bg-secondary text-secondary-foreground', icon: Clock },
  'ACTION REQUIRED': {
    label: 'Action Required',
    chipClass: 'bg-primary/10 text-primary',
    icon: Zap,
  },
  OVERDUE: { label: 'Overdue', chipClass: 'bg-danger-bg text-danger', icon: AlertTriangle },
};

const GROUP_ORDER: TaskKind[] = ['UPCOMING', 'ACTION REQUIRED', 'OVERDUE'];

function TaskGroup({ kind, items }: { kind: TaskKind; items: TaskItem[] }) {
  const style = GROUP_STYLES[kind];
  const Icon = style.icon;
  if (items.length === 0) return null;
  return (
    <div>
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${style.chipClass}`}>
        <Icon className="size-3.5" aria-hidden="true" />
        {style.label}
      </span>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li
            key={item.title}
            className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5"
          >
            <span className="min-w-0 text-sm font-medium text-foreground">{item.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{item.due}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CriticalCard({ task }: { task: CriticalTask }) {
  return (
    <div className="rounded-xl border border-danger/30 bg-danger-bg p-4">
      <p className="text-[11px] font-bold uppercase tracking-widest text-danger">
        Critical Deadline
      </p>
      <p className="mt-1.5 text-sm font-bold text-foreground">{task.title}</p>
      <p className="mt-1 text-sm leading-relaxed text-foreground/80">
        {task.bodyLead} <strong className="font-semibold text-danger">{task.dateEm}</strong>{' '}
        {task.bodyTail}
      </p>
      <Button
        type="button"
        size="sm"
        className="mt-3"
        onClick={() => toast.info('Deadline review is not available yet')}
      >
        {task.cta}
      </Button>
    </div>
  );
}

export default function TasksRail({ tasks }: { tasks: TaskGroups }) {
  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Deadlines
        </p>
        <h2 className="mt-1 font-display text-lg font-bold text-foreground sm:text-xl">
          Tasks &amp; Deadlines
        </h2>

        <div className="mt-4 space-y-4">
          {GROUP_ORDER.map((kind) => (
            <TaskGroup
              key={kind}
              kind={kind}
              items={tasks[kind === 'ACTION REQUIRED' ? 'action' : kind === 'UPCOMING' ? 'upcoming' : 'overdue']}
            />
          ))}
        </div>

        <div className="mt-4">
          <CriticalCard task={tasks.critical} />
        </div>
      </CardContent>
    </Card>
  );
}
