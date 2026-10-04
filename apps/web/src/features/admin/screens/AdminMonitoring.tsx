import { Link } from 'react-router-dom';
import { Activity, FolderGit2, Radio } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import ErrorState from '@/components/feedback/ErrorState';
import LoadingState from '@/components/feedback/LoadingState';
import { formatRelative } from '@/lib/utils/time';
import { useMonitoring } from '../hooks';
import type { MonitoringProjectRow } from '../data';

/**
 * §16.3 Monitoring — cross-project oversight, READ-ONLY by design (§4.6
 * guardrail: the Coordinator observes, never approves or advances work).
 *
 * Backed by `GET /projects` with a bounded per-row fan-out (stages +
 * activity, plan 13.4) — first page only, single activity read per row.
 * LIVE-ONLY: a stale fixture counter here would defeat the screen's purpose.
 */

function Counter({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`mt-1 font-display text-3xl font-bold ${tone ?? 'text-foreground'}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function StageCell({ row }: { row: MonitoringProjectRow }) {
  if (row.currentStage === null) {
    return (
      <span className="text-xs text-muted-foreground">
        {row.status === 'archived' ? 'Archived — no active stage' : 'No workflow stages'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <Badge variant="secondary">{row.currentStagePosition !== null ? `#${row.currentStagePosition}` : '—'}</Badge>
      <span className="truncate text-sm text-foreground">{row.currentStage}</span>
    </span>
  );
}

export default function AdminMonitoring() {
  const query = useMonitoring();

  if (query.isPending) return <LoadingState label="Loading monitoring…" />;
  if (query.isError || !query.data) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
        <ErrorState
          message="Monitoring could not be loaded right now."
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  const { counts, projects, feed } = query.data;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <span>Admin</span>
        <span aria-hidden="true">›</span>
        <span className="text-foreground">Monitoring</span>
      </nav>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
            Department Monitoring
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Read-only oversight (§4.6): where every project sits in its workflow and what
            changed recently. Observing only — the Coordinator never approves or advances
            academic work.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>
          {query.isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
      </header>

      <section aria-label="Project counters" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Counter label="Total projects" value={counts.total} />
        <Counter label="Active" value={counts.active} />
        <Counter label="Completed" value={counts.completed} />
        <Counter label="Archived" value={counts.archived} />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        {/* Project tracker — first page only (bounded fan-out, plan 13.4).
            min-w-0 lets the grid track shrink below the table's min-width so
            the overflow-x-auto wrapper scrolls instead of widening the page
            (375px width check, Phase 13). */}
        <section aria-label="Project stages" className="min-w-0 lg:col-span-3">
          <h2 className="font-display text-lg font-bold text-foreground">Current stages</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            First page of projects with their live tracker; drill into the project for the
            full stage list.
          </p>
          <Card className="mt-3">
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[560px] table-fixed border-collapse text-sm">
                <colgroup>
                  <col style={{ width: '44%' }} />
                  <col style={{ width: '30%' }} />
                  <col style={{ width: '26%' }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="px-5 py-3 font-semibold">Project</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Stage</th>
                    <th scope="col" className="px-3 py-3 font-semibold">State</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-0 hover:bg-accent/40">
                      <td className="px-5 py-3.5">
                        <p className="truncate font-semibold text-foreground">{row.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{row.studentName}</p>
                      </td>
                      <td className="px-3 py-3.5">
                        <StageCell row={row} />
                      </td>
                      <td className="px-3 py-3.5">
                        <Badge
                          variant={
                            row.status === 'active'
                              ? 'default'
                              : row.status === 'completed'
                                ? 'success'
                                : 'secondary'
                          }
                        >
                          {row.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {projects.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-5 py-6 text-center text-sm text-muted-foreground">
                        No projects yet — monitoring fills in as soon as the first one exists.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </section>

        {/* Merged stage.* activity feed (§11.13 derived, newest first). */}
        <section aria-label="Recent activity" className="min-w-0 lg:col-span-2">
          <h2 className="font-display text-lg font-bold text-foreground">Recent activity</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Derived stage events across the tracked projects — never an event row (§11.13).
          </p>
          <Card className="mt-3">
            <CardContent className="p-5">
              {feed.length === 0 ? (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Radio className="size-4 shrink-0" aria-hidden="true" />
                  Nothing recorded yet.
                </div>
              ) : (
                <ol className="space-y-4">
                  {feed.map((item) => (
                    <li key={item.id} className="flex gap-3">
                      <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-sm text-foreground">{item.summary}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {item.actorName ? `${item.actorName} · ` : ''}
                          {formatRelative(item.at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <FolderGit2 className="size-3.5" aria-hidden="true" />
        Need the full list? <Link to="/projects" className="font-semibold text-primary hover:underline">Projects</Link>{' '}
        carries search and paging; <Activity className="size-3.5" aria-hidden="true" /> reports live in{' '}
        <Link to="/reports" className="font-semibold text-primary hover:underline">Reports</Link>.
      </p>
    </div>
  );
}
