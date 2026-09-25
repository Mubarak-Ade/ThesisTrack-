import { ShieldAlert, UserRound, UsersRound, Zap } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ConsoleStats } from '../data/types';

interface Tile {
  label: string;
  value: string;
  note: string;
  icon: typeof Zap;
  tileClass: string;
  noteClass?: string;
}

/** Four aggregate cards (spec §5.2). Only the total can come live (§4). */
export default function StatCards({ stats }: { stats: ConsoleStats }) {
  const tiles: Tile[] = [
    {
      label: 'Total Accounts',
      value: stats.total.toLocaleString('en-US'),
      note: stats.usedFallback ? `${stats.totalDelta} (sample)` : stats.totalDelta,
      icon: UsersRound,
      tileClass: 'bg-primary/10 text-primary',
    },
    {
      label: 'Active Students',
      value: stats.students.toLocaleString('en-US'),
      note: stats.engagement,
      icon: UserRound,
      tileClass: 'bg-success-bg text-success',
    },
    {
      label: 'Faculty Members',
      value: stats.faculty.toLocaleString('en-US'),
      note: stats.facultyNote,
      icon: Zap,
      tileClass: 'bg-secondary text-secondary-foreground',
    },
    {
      label: 'Security Alerts',
      value: String(stats.alerts).padStart(2, '0'),
      note: stats.alertsNote,
      icon: ShieldAlert,
      tileClass: 'bg-danger-bg text-danger',
      noteClass: 'text-danger',
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <Card key={tile.label}>
            <CardContent className="flex items-start gap-4 p-5">
              <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', tile.tileClass)}>
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {tile.label}
                </p>
                <p className="mt-1 font-display text-2xl font-bold text-foreground">{tile.value}</p>
                <p className={cn('mt-0.5 text-xs text-muted-foreground', tile.noteClass)}>
                  {tile.note}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
