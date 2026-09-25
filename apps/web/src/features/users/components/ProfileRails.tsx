import { BookOpen, Clock, FileText, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { UserDetail } from '../data/types';

/** Thesis Assignments rail — fixtures, no endpoint (spec §4). */
export function ThesisAssignments({ detail }: { detail: UserDetail }) {
  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Research</p>
        <h2 className="mt-1 font-display text-lg font-bold text-foreground">
          Thesis Assignments
        </h2>

        <ul className="mt-4 space-y-3">
          {detail.theses.map((thesis) => (
            <li key={thesis.code} className="rounded-xl border border-border bg-background p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-primary">
                  <BookOpen className="size-3.5" aria-hidden="true" />
                  {thesis.code}
                </span>
                <Badge
                  variant={thesis.badge === 'COMPLETED' ? 'success' : 'default'}
                  className="uppercase tracking-wide"
                >
                  {thesis.badge}
                </Badge>
              </div>
              <p className="mt-2 text-sm font-semibold text-foreground">{thesis.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Supervisor: {thesis.supervisor} • Updated {thesis.updated}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Audit logs rail — fixtures (spec §4). */
export function AuditLogs({ detail }: { detail: UserDetail }) {
  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Security</p>
        <h2 className="mt-1 font-display text-lg font-bold text-foreground">Audit Logs</h2>

        <div className="relative mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-bold">Action</th>
                <th scope="col" className="px-3 py-2 font-bold">IP</th>
                <th scope="col" className="px-3 py-2 font-bold">When</th>
                <th scope="col" className="py-2 pl-3 font-bold">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {detail.audit.map((row) => (
                <tr key={`${row.action}-${row.at}`} className="border-b border-border/70 last:border-0">
                  <td className="py-2.5 pr-3 font-medium text-foreground">{row.action}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{row.ip}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{row.at}</td>
                  <td className="py-2.5 pl-3">
                    <Badge
                      variant={row.outcome === 'WARNING' ? 'danger' : 'success'}
                      className="uppercase tracking-wide"
                    >
                      {row.outcome}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

const ACTIVITY_ICON: Record<
  UserDetail['activity'][number]['iconKind'],
  { icon: typeof Clock; tileClass: string }
> = {
  system: { icon: Clock, tileClass: 'bg-secondary text-secondary-foreground' },
  upload: { icon: FileText, tileClass: 'bg-primary/10 text-primary' },
  approve: { icon: ShieldCheck, tileClass: 'bg-success-bg text-success' },
};

/** Recent activity rail — fixtures (spec §4). */
export function ActivityFeed({ detail }: { detail: UserDetail }) {
  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Timeline</p>
        <h2 className="mt-1 font-display text-lg font-bold text-foreground">Recent Activity</h2>

        <ul className="mt-4 space-y-4">
          {detail.activity.map((item) => {
            const style = ACTIVITY_ICON[item.iconKind];
            const Icon = style.icon;
            return (
              <li key={`${item.strong}-${item.when}`} className="flex items-start gap-3">
                <span className={cn('grid size-8 shrink-0 place-items-center rounded-full', style.tileClass)}>
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

/** Admin Oversight card — fixtures (spec §4). */
export function AdminOversight({ detail }: { detail: UserDetail }) {
  const rows = [
    { label: 'Last login', value: detail.oversight.lastLogin },
    { label: 'Account created by', value: detail.oversight.createdBy },
    { label: 'Permissions', value: detail.oversight.permissions },
    { label: 'Registration no.', value: detail.registrationNumber ?? '—' },
  ];

  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Governance</p>
        <h2 className="mt-1 font-display text-lg font-bold text-foreground">Admin Oversight</h2>

        <dl className="mt-4 space-y-3">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-3 border-b border-border/70 pb-2 last:border-0 last:pb-0">
              <dt className="text-xs text-muted-foreground">{row.label}</dt>
              <dd className="text-right text-sm font-medium text-foreground">{row.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
