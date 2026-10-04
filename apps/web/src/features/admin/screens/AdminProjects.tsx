import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ArchiveRestore, FolderGit2, Search } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import Pagination from '@/components/ui/pagination';
import ConfirmDialog from '@/components/feedback/ConfirmDialog';
import EmptyState from '@/components/feedback/EmptyState';
import ErrorState from '@/components/feedback/ErrorState';
import LoadingState from '@/components/feedback/LoadingState';
import { formatRelative } from '@/lib/utils/time';
import { useProjects, useSetProjectStatus } from '../hooks';
import type { AdminProjectRow, ProjectStatus } from '../data';

/** Mockup parity with the directory screens — page size 10. */
const PAGE_SIZE = 10;

const STATUS_FILTERS: Array<{ value: ProjectStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

const STATUS_BADGE: Record<ProjectStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'border-primary/20 bg-primary/10 text-primary' },
  completed: {
    label: 'Completed',
    className: 'border-transparent bg-success-bg text-success',
  },
  archived: { label: 'Archived', className: 'bg-muted text-muted-foreground' },
};

/**
 * §16.3 Projects (admin) — `GET /projects` scoped "all" (§4.5) with the §5.8
 * Flow H archive affordance (§19.3): archive and restore on one row, behind a
 * destructive confirmation. Live-only: a fixture row under an archive button
 * would 404 on click (Rule 3).
 */
export default function AdminProjects() {
  const [status, setStatus] = useState<ProjectStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [pending, setPending] = useState<AdminProjectRow | null>(null);
  const searchTimer = useRef<number | null>(null);

  const query = useProjects({ page, limit: PAGE_SIZE, status, q: q || undefined });
  const setStatusMutation = useSetProjectStatus();
  const data = query.data;
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  const onSearch = (value: string) => {
    setSearch(value);
    setPage(1);
    // Debounced commit — one request per pause, not per keystroke.
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => setQ(value), 300);
  };

  const confirmArchive = () => {
    if (!pending) return;
    setStatusMutation.mutate(
      { projectId: pending.id, status: 'archived' },
      {
        onSuccess: () => {
          toast.success('Project archived — the project is now read-only (§5.8).');
          setPending(null);
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const restore = (project: AdminProjectRow) => {
    setStatusMutation.mutate(
      { projectId: project.id, status: 'active' },
      {
        onSuccess: () => toast.success('Project restored to active.'),
        onError: (error) => toast.error(error.message),
      },
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <span>Admin</span>
        <span aria-hidden="true">›</span>
        <span className="text-foreground">Projects</span>
      </nav>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
            Projects
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Every thesis project in the department — status, ownership and archiving (§5.8).
          </p>
        </div>
      </header>

      <Card className="mt-6">
        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Filter by status"
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
          <div className="relative min-w-0 flex-1 sm:w-64">
            <Input
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Search project titles…"
              aria-label="Search projects"
              className="pr-9"
            />
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
          </div>
        </CardContent>
      </Card>

      <section className="mt-4" aria-label="Project list">
        {query.isPending ? (
          <LoadingState label="Loading projects…" />
        ) : query.isError ? (
          <ErrorState
            message="Projects could not be loaded right now."
            onRetry={() => void query.refetch()}
          />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={<FolderGit2 className="size-5" />}
            eyebrow="Nothing here yet"
            title={status === 'all' ? 'No projects yet' : `No ${status} projects`}
            description="Projects appear once a proposal is approved (§5.4) or an admin creates one."
          />
        ) : (
          <Card>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
                <colgroup>
                  <col style={{ width: '34%' }} />
                  <col style={{ width: '24%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '14%' }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="px-5 py-3 font-semibold">Project</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Student</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Status</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Updated</th>
                    <th scope="col" className="px-3 py-3 font-semibold">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((project) => (
                    <tr key={project.id} className="border-b border-border last:border-0 hover:bg-accent/40">
                      <td className="px-5 py-3.5">
                        <p className="truncate font-semibold text-foreground">{project.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {project.workflowId ? 'Workflow linked' : 'No workflow (zero stages)'}
                        </p>
                      </td>
                      <td className="px-3 py-3.5">
                        <p className="truncate text-sm text-foreground">{project.studentName}</p>
                        <p className="truncate text-xs text-muted-foreground">{project.studentEmail}</p>
                      </td>
                      <td className="px-3 py-3.5">
                        <span
                          className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${STATUS_BADGE[project.status].className}`}
                        >
                          {STATUS_BADGE[project.status].label}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-xs text-muted-foreground">
                        {formatRelative(project.updatedAt)}
                      </td>
                      <td className="px-3 py-3.5 text-right">
                        {project.status === 'archived' ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label={`Restore ${project.title}`}
                            onClick={() => restore(project)}
                            disabled={setStatusMutation.isPending}
                          >
                            <ArchiveRestore aria-hidden="true" />
                            Restore
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label={`Archive ${project.title}`}
                            onClick={() => setPending(project)}
                            disabled={setStatusMutation.isPending}
                          >
                            <Archive aria-hidden="true" />
                            Archive
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
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

      <ConfirmDialog
        open={pending !== null}
        title="Archive this project?"
        description={
          <>
            <strong>{pending?.title}</strong> becomes read-only: students and supervisors lose
            write access, and the project leaves the active lists. You can restore it at any
            time.
          </>
        }
        confirmLabel="Archive project"
        destructive
        loading={setStatusMutation.isPending}
        onConfirm={confirmArchive}
        onCancel={() => setPending(null)}
      />

      <p className="mt-4 text-xs text-muted-foreground">
        Archiving is the MVP's only project deletion path — <code>DELETE /projects</code> is
        rejected (I12). See <Link to="/monitoring" className="text-primary hover:underline">Monitoring</Link> for stage state.
      </p>
    </div>
  );
}
