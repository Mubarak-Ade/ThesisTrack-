import { CircleCheck, MessageSquare, Trophy } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { DashActivity } from '../data/types';

const KIND_STYLES: Record<
  DashActivity['iconKind'],
  { icon: typeof MessageSquare; tileClass: string }
> = {
  feedback: { icon: MessageSquare, tileClass: 'bg-primary/10 text-primary' },
  proposal: { icon: CircleCheck, tileClass: 'bg-success-bg text-success' },
  milestone: { icon: Trophy, tileClass: 'bg-secondary text-secondary-foreground' },
};

export default function RecentActivity({ items }: { items: DashActivity[] }) {
  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold text-foreground sm:text-xl">
          Recent Activity
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Departmental audit trail</p>

        <ul className="mt-4 space-y-4">
          {items.map((item) => {
            const style = KIND_STYLES[item.iconKind];
            const Icon = style.icon;
            return (
              <li key={`${item.strong}-${item.when}`} className="flex items-start gap-3">
                <span
                  className={cn(
                    'grid size-9 shrink-0 place-items-center rounded-full',
                    style.tileClass,
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm leading-snug text-foreground">
                    {item.before}
                    <strong className="font-semibold">{item.strong}</strong>
                    {item.after}
                  </p>
                  <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {item.when}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
