import { ArrowLeft, Building2, ChevronDown, Download, Gauge, GraduationCap, MoreHorizontal, TriangleAlert, UserPlus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import SampleDataBanner from '@/components/feedback/SampleDataBanner';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import Pagination from '@/components/ui/pagination';
import { downloadCsv } from '@/lib/csv';
import { cn } from '@/lib/utils';
import { getFaculty, type FacultySnapshot, type FacultyStatus, type SupervisorRow } from '../data';

/** Honest server-side paging (spec §5.5 — page size 5, real page 2). */
const PAGE_SIZE = 5;

const STATUS_STYLE: Record<FacultyStatus, string> = {
  'MAX LOAD': 'border-transparent bg-danger-bg text-danger',
  ACTIVE: 'border-transparent bg-success-bg text-success',
  'ON LEAVE': 'border-transparent bg-muted text-muted-foreground',
  INACTIVE: 'border-transparent bg-muted text-muted-foreground',
};

/** Stat tiles (spec §5.5) — four live probe totals, honest uppercase notes. */
function FacultyStatCards({ stats }: { stats: FacultySnapshot['stats'] }) {
  const tiles = [
    {
      label: 'Total Supervisors',
      value: stats.total.toLocaleString('en-US'),
      note: stats.totalNote,
      icon: Users,
      iconClass: 'bg-primary/10 text-primary',
      noteClass: 'uppercase tracking-wide',
    },
    {
      label: 'Active Supervisors',
      value: stats.activeSupervisors.toLocaleString('en-US'),
      note: stats.activeSupervisorsNote,
      icon: Gauge,
      iconClass: 'bg-success-bg text-success',
      noteClass: 'uppercase tracking-wide',
    },
    {
      label: 'Students Overall',
      value: stats.students.toLocaleString('en-US'),
      note: stats.studentsNote,
      icon: GraduationCap,
      iconClass: 'bg-secondary text-secondary-foreground',
      noteClass: 'uppercase tracking-wide',
    },
    {
      label: 'Pending Reviews',
      value: String(stats.pending).padStart(2, '0'),
      note: stats.pendingNote,
      icon: TriangleAlert,
      iconClass: 'bg-danger-bg text-danger',
      noteClass: 'uppercase tracking-wide text-danger',
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
              <p className={cn('mt-2 font-display text-3xl font-bold text-foreground', tile.valueClass)}>
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

/** Faculty Supervisors screen (spec §5.5) — live repo read with sample fallback. */
export default function SupervisorList() {
  const [snapshot, setSnapshot] = useState<FacultySnapshot | null>(null);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Debounced search (300ms) — keystrokes only update `search`.
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Server-driven paging + search: the repo is the data boundary (spec §4).
  useEffect(() => {
    let alive = true;
    setLoading(true);
    void getFaculty({ page, limit: PAGE_SIZE, q }).then((next) => {
      if (alive) {
        setSnapshot(next);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [q, page]);

  // Rows arrive already filtered + paged for the current `q`/`page`.
  const rows = snapshot?.rows ?? [];
  const total = snapshot?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const pageRows = rows;

  const onSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const exportCsv = () => {
    downloadCsv(
      'thesistrack-faculty-supervisors.csv',
      ['Name', 'Code', 'Email', 'Program', 'Students', 'Capacity', 'Avg Progress', 'Status', 'Last Activity'],
      pageRows.map((row) => [
        row.name,
        row.code,
        row.email,
        row.program,
        row.workloadStudents ?? '',
        row.capacity ?? '',
        row.avgProgress === null ? '' : `${row.avgProgress}%`,
        row.status,
        row.lastActivity ?? '',
      ]),
    );
  };

  const stats = snapshot?.stats;
  const distribution = snapshot?.distribution ?? [];
  const alerts = snapshot?.alerts ?? [];
  const maxSupervisors = Math.max(1, ...distribution.map((entry) => entry.supervisors));

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      {/* Breadcrumb (spec §3): ADMIN › USERS › SUPERVISORS */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <span>Admin</span>
        <span aria-hidden="true">›</span>
        <Link to="/users" className="transition-colors hover:text-primary">
          Users
        </Link>
        <span aria-hidden="true">›</span>
        <span className="text-foreground">Supervisors</span>
      </nav>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link
            to="/users"
            aria-label="Back to All Users"
            className="grid size-10 shrink-0 place-items-center rounded-full border border-input bg-white text-foreground shadow-sm transition-colors hover:bg-accent"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
              Faculty Supervisors
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              Manage thesis supervision workloads and department assignments.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={exportCsv}>
            <Download aria-hidden="true" />
            Export CSV
          </Button>
          <Button type="button" asChild>
            <Link to="/users/new">
              <UserPlus aria-hidden="true" />
              Add Supervisor
            </Link>
          </Button>
        </div>
      </header>

      {/* Sample-data banner while the repo is in fixture fallback (§10.4). */}
      {snapshot?.usedFallback && (
        <div className="mt-6">
          <SampleDataBanner />
        </div>
      )}

      {stats && <div className="mt-6">
        <FacultyStatCards stats={stats} />

        {/* Toolbar: debounced server search + decorative filters (spec §5.5). */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-md">
            <Input
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Search by name, email, or program…"
              aria-label="Search faculty supervisors"
              className="pr-9"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              <span className="grid size-4 place-items-center">⌕</span>
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => toast.info('Department filtering is not available yet')}
          >
            All Departments
            <ChevronDown aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => toast.info('Load status filtering is not available yet')}
          >
            Load Status
            <ChevronDown aria-hidden="true" />
          </Button>
        </div>

        {/* Workload table (spec §5.5). */}
        <Card className="mt-4">
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[880px] table-fixed border-collapse text-sm">
              <colgroup>
                <col style={{ width: '25%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '5%' }} />
              </colgroup>
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th scope="col" className="px-5 py-3 font-semibold">Supervisor Details</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Program</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Load</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Avg. Progress</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Last Activity</th>
                  <th scope="col" className="px-3 py-3 font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <FacultyRow
                    key={row.code}
                    row={row}
                    onAction={() => toast.info('Row actions are not available yet')}
                  />
                ))}
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-sm text-muted-foreground">
                      No supervisors match your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-4">
            <Pagination
              page={current}
              pageCount={pageCount}
              variant="prevNext"
              loading={loading}
              footer={`Showing ${pageRows.length} of ${total} faculty supervisors`}
              onPageChange={setPage}
            />
          </div>
        </Card>

        {/* Bottom 3-col: distribution / alerts / tools + SYSTEM NOTICE (spec §5.5). */}
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <h2 className="font-display text-lg font-bold text-foreground">
                Program Distribution
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {snapshot?.usedFallback
                  ? 'Sample groups (fixture snapshot).'
                  : 'Current page only — grouped by program.'}
              </p>
              <ul className="mt-4 space-y-3.5">
                {distribution.map((entry) => (
                  <li key={entry.program}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium text-foreground">{entry.program}</span>
                      <span className="font-semibold text-foreground">{entry.supervisors}</span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(entry.supervisors / maxSupervisors) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h2 className="font-display text-lg font-bold text-foreground">Load Capacity Alerts</h2>
              {alerts.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  No load alerts — workload data has no endpoint (§4.5).
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {alerts.map((alert) => (
                    <li
                      key={alert.name}
                      className={cn(
                        'rounded-lg border p-3.5',
                        alert.severity === 'danger'
                          ? 'border-danger/30 bg-danger-bg'
                          : 'border-amber-300 bg-amber-50',
                      )}
                    >
                      <p
                        className={cn(
                          'flex items-center gap-2 text-sm font-bold',
                          alert.severity === 'danger' ? 'text-danger' : 'text-amber-700',
                        )}
                      >
                        <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                        {alert.name}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-foreground/80">{alert.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h2 className="font-display text-lg font-bold text-foreground">Administrative Tools</h2>
              <ul className="mt-3 divide-y divide-border">
                {(snapshot?.adminTools ?? []).map((tool) => {
                  const label = (
                    <span className="flex w-full items-center justify-between gap-3 py-3 text-xs font-bold uppercase tracking-wider text-primary">
                      {tool.label}
                      <span aria-hidden="true">→</span>
                    </span>
                  );
                  return (
                    <li key={tool.label}>
                      {tool.to ? (
                        <Link to={tool.to} className="transition-opacity hover:opacity-80">
                          {label}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toast.info(tool.toast ?? 'Not available yet')}
                          className="text-left transition-opacity hover:opacity-80"
                        >
                          {label}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>

              {/* Green SYSTEM NOTICE block (spec §5.5). */}
              <div className="mt-4 rounded-lg border border-success/30 bg-success-bg p-3.5">
                <p className="text-xs font-bold uppercase tracking-widest text-success">
                  System Notice
                </p>
                <p className="mt-1 text-xs leading-relaxed text-foreground/80">
                  {snapshot?.systemNotice}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>}

      {!stats && (
        <p className="mt-8 flex items-center gap-3 text-sm text-muted-foreground" role="status">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Loading faculty…
        </p>
      )}
    </div>
  );
}

/** One directory row — silhouette + code + email, program, load, progress, status. */
function FacultyRow({ row, onAction }: { row: SupervisorRow; onAction: () => void }) {
  return (
    <tr className="border-b border-border last:border-0 hover:bg-accent/40">
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-3">
          <Avatar size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{row.name}</p>
            <p className="truncate font-mono text-xs text-primary">{row.code}</p>
            <p className="truncate text-xs text-muted-foreground">{row.email}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3.5">
        <span className="flex items-center gap-1.5 text-sm text-foreground">
          <Building2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">{row.program}</span>
        </span>
      </td>
      <td className="px-3 py-3.5">
        {row.workloadStudents === null || row.capacity === null ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : (
          <>
            <p className="text-sm font-semibold text-foreground">
              {row.workloadStudents} / {row.capacity} Students
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Current Load
            </p>
          </>
        )}
      </td>
      <td className="px-3 py-3.5">
        {row.avgProgress === null ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : (
          <div className="flex items-center gap-2">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${row.avgProgress}%` }}
              />
            </span>
            <span className="text-xs font-semibold tabular-nums text-foreground">
              {row.avgProgress}%
            </span>
          </div>
        )}
      </td>
      <td className="px-3 py-3.5">
        <span
          className={cn(
            'inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide',
            STATUS_STYLE[row.status],
          )}
        >
          {row.status}
        </span>
      </td>
      <td className="px-3 py-3.5 text-sm text-muted-foreground">{row.lastActivity ?? '—'}</td>
      <td className="px-3 py-3.5 text-right">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Actions for ${row.name}`}
          onClick={onAction}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </td>
    </tr>
  );
}
