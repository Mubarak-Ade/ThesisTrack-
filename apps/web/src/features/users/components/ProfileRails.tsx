import { BookOpen, Clock, FileText, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { UserDetail } from '../data/types';

/** Shared honest copy when the live rail fan-out failed (§16.3). */
function RailsError({ what }: { what: string }) {
  return (
    <p className="mt-4 rounded-lg border border-danger/30 bg-danger-bg/40 p-4 text-sm text-danger">
      {what} could not be loaded — the API is unreachable or its shape changed.
      Reload to retry.
    </p>
  );
}

/**
 * Thesis Assignments rail — live per-student projects
 * (`GET /projects?studentId=` + per-project fan-out, §16.3 User details).
 */
export function ThesisAssignments({ detail }: { detail: UserDetail }) {
  const emptyCopy =
    detail.role === 'student'
      ? 'No thesis projects yet — an approved proposal (§5.4) creates the first one.'
      : 'No thesis projects — projects attach to student accounts.';

  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-foreground">Thesis Assignments</h2>
          <button
            type="button"
            onClick={() => toast.info('Project creation is not available yet')}
            className="text-xs font-bold uppercase tracking-wider text-primary transition-colors hover:underline"
          >
            Add Project ›
          </button>
        </div>

        {detail.railsError ? (
          <RailsError what="Project assignments" />
        ) : detail.theses.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{emptyCopy}</p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {detail.theses.map((thesis) => (
              <li
                key={thesis.code}
                className="flex flex-col rounded-xl border border-border bg-background p-4"
              >
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
                <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-xs">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">Supervisor</dt>
                    <dd className="text-right font-medium text-foreground">{thesis.supervisor}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">Last updated</dt>
                    <dd className="text-right font-medium text-foreground">{thesis.updated}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Audit Logs rail — honest gap: no audit feed exists (spec §19.2 rejected the
 * AuditEvent table, so sign-in history is out of MVP scope). Layout stays per
 * mockup parity §5.4; the fixture table is gone.
 */
export function AuditLogs() {
  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Security
          </p>
          <h2 className="mt-1 font-display text-lg font-bold text-foreground">Audit Logs</h2>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          No audit feed exists — sign-in and auth history are out of MVP scope because
          spec §19.2 rejects the <code>AuditEvent</code> table. This rail shows real
          entries only if that decision changes.
        </p>
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

/** Recent activity rail — live §11.13 derived feed, newest first (§16.3). */
export function ActivityFeed({ detail }: { detail: UserDetail }) {
  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Timeline</p>
        <h2 className="mt-1 font-display text-lg font-bold text-foreground">Recent Activity</h2>

        {detail.railsError ? (
          <RailsError what="Activity" />
        ) : detail.activity.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No project activity yet — stage, submission and review events appear here once
            a project runs.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {detail.activity.map((item) => {
              const style = ACTIVITY_ICON[item.iconKind];
              const Icon = style.icon;
              return (
                <li key={`${item.strong}-${item.when}`} className="flex items-start gap-3">
                  <span
                    className={cn(
                      'grid size-8 shrink-0 place-items-center rounded-full',
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
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Admin Oversight card — registration no. is live; last-login / created-by
 * have no MVP endpoint and render honest em-dashes (spec §19.2 rejects
 * AuditEvent), explained in the footnote.
 */
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
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-3 border-b border-border/70 pb-2 last:border-0 last:pb-0"
            >
              <dt className="text-xs text-muted-foreground">{row.label}</dt>
              <dd className="text-right text-sm font-medium text-foreground">{row.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs italic text-muted-foreground">
          “—” means no MVP endpoint: sign-in and creation audit are out of scope
          (spec §19.2 rejects AuditEvent).
        </p>
      </CardContent>
    </Card>
  );
}
