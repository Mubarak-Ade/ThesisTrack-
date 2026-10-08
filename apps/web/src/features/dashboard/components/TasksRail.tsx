import { AlertTriangle, Clock, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { CriticalTask, TaskGroups, TaskItem } from '../data/types';

interface GroupDef {
  label: string;
  items: TaskItem[];
  labelClass: string;
  icon: typeof Clock;
}

function TaskGroup({ label, items, labelClass, icon }: GroupDef) {
  if (items.length === 0) return null;
  const Icon = icon;
  return (
    <div>
      <p className={cn('flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider', labelClass)}>
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </p>
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
  const navigate = useNavigate();
  return (
    <div className="rounded-xl bg-danger p-4 text-white">
      <p className="text-sm font-bold">Critical Deadline</p>
      <p className="mt-1.5 text-sm leading-relaxed text-white/95">
        {task.bodyLead}
        <strong className="font-bold text-white">{task.dateEm}</strong>
        {task.bodyTail}
      </p>
      <Button
        type="button"
        size="sm"
        onClick={() => navigate(task.to ?? '/faculty')}
        className="mt-3 bg-white text-danger hover:bg-white/95 hover:text-danger"
      >
        {task.cta}
      </Button>
    </div>
  );
}

export default function TasksRail({ tasks }: { tasks: TaskGroups }) {
  const groups: GroupDef[] = [
    {
      label: 'Upcoming',
      items: tasks.upcoming,
      labelClass: 'text-muted-foreground',
      icon: Clock,
    },
    {
      label: 'Action Required',
      items: tasks.action,
      // text-warning (#a16207), not amber-600: the raw amber measured 3.09:1
      // on the card and failed WCAG AA at 12px bold (Phase 14 a11y sweep).
      labelClass: 'text-warning',
      icon: Zap,
    },
  ];

  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold text-foreground sm:text-xl">
          Tasks &amp; Deadlines
        </h2>

        <div className="mt-4 space-y-4">
          {groups.map((group) => (
            <TaskGroup key={group.label} {...group} />
          ))}

          {/* OVERDUE red block with the URGENT pill (spec §5.1). */}
          {tasks.overdue.length > 0 && (
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-danger">
                <AlertTriangle className="size-3.5" aria-hidden="true" />
                Overdue
              </p>
              <ul className="mt-2 space-y-2">
                {tasks.overdue.map((item) => (
                  <li
                    key={item.title}
                    className="flex items-center justify-between gap-3 rounded-lg border border-danger/40 bg-danger-bg px-3 py-2.5"
                  >
                    <span className="min-w-0 text-sm font-semibold text-foreground">{item.title}</span>
                    <span className="shrink-0 rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                      {item.due}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="mt-4">
          <CriticalCard task={tasks.critical} />
        </div>
      </CardContent>
    </Card>
  );
}
