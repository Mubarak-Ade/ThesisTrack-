import { ShieldAlert, UserRound, UsersRound, Zap } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ConsoleStats } from '../data/types';

interface Tile {
  label: string;
  value: string;
  note: string;
  icon: typeof Zap;
  iconClass: string;
  noteClass?: string;
  valueClass?: string;
}

/** Four aggregate cards (spec §5.2). Only the total can come live (§4). */
export default function StatCards({ stats }: { stats: ConsoleStats }) {
  const tiles: Tile[] = [
    {
      label: 'Total Accounts',
      value: stats.total.toLocaleString('en-US'),
      note: stats.usedFallback ? `${stats.totalDelta} (sample)` : stats.totalDelta,
      icon: UsersRound,
      iconClass: 'bg-primary/10 text-primary',
    },
    {
      label: 'Active Students',
      value: stats.students.toLocaleString('en-US'),
      note: stats.engagement,
      icon: UserRound,
      iconClass: 'bg-success-bg text-success',
    },
    {
      label: 'Faculty Members',
      value: stats.faculty.toLocaleString('en-US'),
      note: stats.facultyNote,
      icon: Zap,
      iconClass: 'bg-secondary text-secondary-foreground',
    },
    {
      label: 'System Alerts',
      value: String(stats.alerts).padStart(2, '0'),
      note: stats.alertsNote,
      icon: ShieldAlert,
      iconClass: 'bg-danger-bg text-danger',
      noteClass: 'text-danger',
      valueClass: 'text-danger',
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <Card key={tile.label}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {tile.label}
                </p>
                <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', tile.iconClass)}>
                  <Icon className="size-4" aria-hidden="true" />
                </span>
              </div>
              <p
                className={cn(
                  'mt-2 font-display text-3xl font-bold text-foreground',
                  tile.valueClass,
                )}
              >
                {tile.value}
              </p>
              <p className={cn('mt-1 text-xs', tile.noteClass ?? 'text-muted-foreground')}>
                {tile.note}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
