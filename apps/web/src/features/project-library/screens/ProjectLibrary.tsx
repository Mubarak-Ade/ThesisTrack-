import { useEffect, useMemo, useState } from 'react';
import { FolderSearch, Search } from 'lucide-react';

import EmptyState from '@/components/feedback/EmptyState';
import ErrorState from '@/components/feedback/ErrorState';
import LoadingState from '@/components/feedback/LoadingState';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import Pagination from '@/components/ui/pagination';
import { formatRelative } from '@/lib/utils/time';
import ProjectDetailPanel from '../components/ProjectDetailPanel';
import { useProjectLibrary } from '../hooks/useProjectLibrary';
import type { LibraryStatus } from '../data/types';

const PAGE_SIZE = 10;

const STATUS_FILTERS: Array<{ value: LibraryStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

const STATUS_BADGE: Record<LibraryStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'border-primary/20 bg-primary/10 text-primary' },
  completed: { label: 'Completed', className: 'border-transparent bg-success-bg text-success' },
  archived: { label: 'Archived', className: 'bg-muted text-muted-foreground' },
};

/**
 * Project Library (ADR-18) — institution-wide, read-only duplicate detection.
 *
 * The corpus is every project plus its approved proposal text. The screen is a
 * research surface: it never links into the project workspace and never shows
 * attachments, reviews or submissions.
 */
export default function ProjectLibrary() {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<LibraryStatus | 'all'>('all');
  const [departmentId, setDepartmentId] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // One commit per pause (300 ms) — and every committed search starts at page 1.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const filters = useMemo(
    () => ({
      q: q || undefined,
      status,
      departmentId: departmentId || undefined,
      page,
      limit: PAGE_SIZE,
    }),
    [q, status, departmentId, page],
  );

  const query = useProjectLibrary(filters);
  const data = query.data;
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <span>Research</span>
        <span aria-hidden="true">›</span>
        <span className="text-foreground">Project Library</span>
      </nav>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
              Project Library
            </h1>
            <span className="rounded-full border border-border bg-surface-alt px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Read-only
            </span>
          </div>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Search every approved thesis project across the institution to spot duplicate
            or reworded topics before approving a new proposal.
          </p>
        </div>
      </header>

      <Card className="mt-6">
        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Filter by project status"
          >
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                aria-pressed={status === filter.value}
                onClick={() => {
                  setStatus(filter.value);
                  setPage(1);
                }}
                className={
                  status === filter.value
                    ? 'rounded-full border border-primary bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground'
                    : 'rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground'
                }
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              Department
              <select
                aria-label="Filter by department"
                value={departmentId}
                onChange={(event) => {
                  setDepartmentId(event.target.value);
                  setPage(1);
                }}
                className="h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground"
              >
                <option value="">All departments</option>
                {(data?.departments ?? []).map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name} ({department.count})
                  </option>
                ))}
              </select>
            </label>

            <div className="relative min-w-0 flex-1 sm:w-72">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search titles, abstracts and descriptions…"
                aria-label="Search the project library"
                className="pr-9"
              />
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="mt-4" aria-label="Project library results">
        {query.isPending ? (
          <LoadingState label="Loading the project library…" />
        ) : query.isError ? (
          <ErrorState
            message="The project library could not be loaded right now."
            onRetry={() => void query.refetch()}
          />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={<FolderSearch className="size-5" />}
            eyebrow="Nothing here yet"
            title={q ? 'No matching projects' : 'No projects in the library yet'}
            description={
              q
                ? 'Try a shorter phrase, or clear the filters to widen the search.'
                : 'Projects appear here once a proposal is approved (thesis projects are created by approval).'
            }
          />
        ) : (
          <Card>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-sm">
                <colgroup>
                  <col style={{ width: '30%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '8%' }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="px-5 py-3 font-semibold">Project</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Student</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Department</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Supervisor</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Session</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Status</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Updated</th>
                    <th scope="col" className="px-3 py-3 font-semibold">
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => {
                    const badge = STATUS_BADGE[row.status];
                    return (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedId(row.id)}
                        className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/40"
                      >
                        <td className="px-5 py-3.5">
                          <p className="font-semibold text-foreground">{row.title}</p>
                          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                            {row.excerpt ?? row.description}
                          </p>
                        </td>
                        <td className="px-3 py-3.5 text-sm text-foreground">
                          {row.student.firstName} {row.student.lastName}
                        </td>
                        <td className="px-3 py-3.5 text-xs text-muted-foreground">
                          {row.department?.name ?? '—'}
                        </td>
                        <td className="px-3 py-3.5 text-xs text-muted-foreground">
                          {row.supervisors.length > 0
                            ? row.supervisors
                                .map((person) => `${person.firstName} ${person.lastName}`)
                                .join(', ')
                            : '—'}
                        </td>
                        <td className="px-3 py-3.5 text-xs text-muted-foreground">
                          {row.session ?? '—'}
                        </td>
                        <td className="px-3 py-3.5">
                          <span
                            className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-xs text-muted-foreground">
                          {formatRelative(row.updatedAt)}
                        </td>
                        <td className="px-3 py-3.5 text-right">
                          <button
                            type="button"
                            aria-label={`View ${row.title}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedId(row.id);
                            }}
                            className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-4">
              <Pagination
                page={page}
                pageCount={pageCount}
                loading={query.isFetching}
                footer={`Showing ${data.items.length} of ${data.total} projects`}
                onPageChange={setPage}
              />
            </div>
          </Card>
        )}
      </section>

      <ProjectDetailPanel
        projectId={selectedId}
        onClose={() => setSelectedId(null)}
        onSelectSimilar={setSelectedId}
      />
    </div>
  );
}
