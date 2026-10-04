import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GitBranch, Plus, Star } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import Pagination from '@/components/ui/pagination';
import ConfirmDialog from '@/components/feedback/ConfirmDialog';
import EmptyState from '@/components/feedback/EmptyState';
import ErrorState from '@/components/feedback/ErrorState';
import LoadingState from '@/components/feedback/LoadingState';
import { formatRelative } from '@/lib/utils/time';
import { useWorkflowWrite, useWorkflows } from '../hooks';
import type { WorkflowSummary } from '../data';

/**
 * §16.3 Workflows — the workflow builder's list half (§3.4/FR-CW-01):
 * list (active + optional archived), create, set default (PROPOSED PATCH
 * delta 2026-10-04), archive (§11.14 "archive instead") and delete (422 when
 * referenced → the message surfaces verbatim). Stage editing lives in the
 * editor screen.
 *
 * LIVE-ONLY: every row is a write target (Rule 3).
 */
const PAGE_SIZE = 10;

type DialogState =
  | { kind: 'create' }
  | { kind: 'setDefault' | 'archive' | 'delete'; workflow: WorkflowSummary }
  | null;

const EMPTY_CREATE = { name: '', program: '', academicSession: '', description: '' };

export default function WorkflowList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [form, setForm] = useState(EMPTY_CREATE);

  const query = useWorkflows({ page, limit: PAGE_SIZE, includeArchived });
  const write = useWorkflowWrite();
  const data = query.data;
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  const close = () => {
    setDialog(null);
    setForm(EMPTY_CREATE);
  };

  const confirm = () => {
    if (!dialog) return;
    if (dialog.kind === 'create') {
      const name = form.name.trim();
      if (!name) {
        toast.error('Workflow name is required.');
        return;
      }
      write.mutate(
        {
          action: 'create',
          input: {
            name,
            program: form.program.trim() || null,
            academicSession: form.academicSession.trim() || null,
            description: form.description.trim() || null,
            stages: [],
          },
        },
        {
          onSuccess: (detail) => {
            if (!detail) return; // create always answers a definition — guard is for the union type
            toast.success('Workflow created — add its stages next.');
            close();
            navigate(`/workflows/${detail.workflow.id}`);
          },
          onError: (error) => toast.error(error.message),
        },
      );
      return;
    }

    const { workflow } = dialog;
    if (dialog.kind === 'setDefault') {
      write.mutate(
        { action: 'patch', workflowId: workflow.id, input: { isDefault: true } },
        {
          onSuccess: () => {
            toast.success(`"${workflow.name}" is now the default workflow (ADR-16).`);
            close();
          },
          onError: (error) => toast.error(error.message),
        },
      );
    } else if (dialog.kind === 'archive') {
      write.mutate(
        { action: 'patch', workflowId: workflow.id, input: { archived: true } },
        {
          onSuccess: () => {
            toast.success('Workflow archived — it releases its program slot (§8.10).');
            close();
          },
          onError: (error) => toast.error(error.message),
        },
      );
    } else {
      write.mutate(
        { action: 'delete', workflowId: workflow.id },
        {
          onSuccess: () => {
            toast.success('Workflow deleted.');
            close();
          },
          // 422 = projects reference it (§8.11 RESTRICT) — archive instead.
          onError: (error) => toast.error(error.message),
        },
      );
    }
  };

  const restore = (workflow: WorkflowSummary) => {
    write.mutate(
      { action: 'patch', workflowId: workflow.id, input: { archived: false } },
      {
        onSuccess: () => toast.success('Workflow restored.'),
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const createField = (
    key: keyof typeof EMPTY_CREATE,
    label: string,
    props: { placeholder?: string; required?: boolean } = {},
  ) => (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {label}
        {props.required ? ' *' : ''}
      </span>
      <Input
        value={form[key]}
        onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
        placeholder={props.placeholder}
        className="mt-1.5"
      />
    </label>
  );

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <span>Admin</span>
        <span aria-hidden="true">›</span>
        <span className="text-foreground">Workflows</span>
      </nav>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
            Academic Workflows
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            The Coordinator defines the process (§3.4): stages a project passes through, one
            active workflow per program (FR-CW-08), and the flagged default ADR-16 falls back
            to.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            aria-pressed={includeArchived}
            onClick={() => {
              setIncludeArchived((v) => !v);
              setPage(1);
            }}
          >
            {includeArchived ? 'Hiding archived' : 'Showing archived'}
          </Button>
          <Button type="button" onClick={() => setDialog({ kind: 'create' })}>
            <Plus aria-hidden="true" />
            New workflow
          </Button>
        </div>
      </header>

      <section className="mt-6" aria-label="Workflow list">
        {query.isPending ? (
          <LoadingState label="Loading workflows…" />
        ) : query.isError ? (
          <ErrorState
            message="Workflows could not be loaded right now."
            onRetry={() => void query.refetch()}
          />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={<GitBranch className="size-5" />}
            eyebrow="No definitions"
            title={includeArchived ? 'No workflows yet' : 'No active workflows'}
            description="Create the first workflow: name it, tie it to a program, then add its stages in the editor. The seeded Default workflow covers unaffiliated students (ADR-16)."
            action={
              <Button type="button" onClick={() => setDialog({ kind: 'create' })}>
                <Plus aria-hidden="true" />
                New workflow
              </Button>
            }
          />
        ) : (
          <Card>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[820px] table-fixed border-collapse text-sm">
                <colgroup>
                  <col style={{ width: '30%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '25%' }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="px-5 py-3 font-semibold">Workflow</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Program</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Session</th>
                    <th scope="col" className="px-3 py-3 font-semibold">State</th>
                    <th scope="col" className="px-3 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((workflow) => (
                    <tr key={workflow.id} className="border-b border-border last:border-0 hover:bg-accent/40">
                      <td className="px-5 py-3.5">
                        <Link
                          to={`/workflows/${workflow.id}`}
                          className="truncate font-semibold text-foreground hover:text-primary"
                        >
                          {workflow.name}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          updated {formatRelative(workflow.updatedAt)}
                        </p>
                      </td>
                      <td className="px-3 py-3.5 text-sm text-foreground">
                        {workflow.program ?? <span className="text-muted-foreground">Any (fallback)</span>}
                      </td>
                      <td className="px-3 py-3.5 text-sm text-muted-foreground">
                        {workflow.academicSession ?? '—'}
                      </td>
                      <td className="px-3 py-3.5">
                        <span className="flex flex-wrap gap-1.5">
                          {workflow.isDefault && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-700">
                              <Star className="size-3" aria-hidden="true" /> Default
                            </span>
                          )}
                          <Badge variant={workflow.archivedAt ? 'secondary' : 'default'}>
                            {workflow.archivedAt ? 'Archived' : 'Active'}
                          </Badge>
                        </span>
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Button asChild variant="outline" size="sm">
                            <Link to={`/workflows/${workflow.id}`}>Stages</Link>
                          </Button>
                          {!workflow.isDefault && !workflow.archivedAt && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              aria-label={`Set ${workflow.name} as default`}
                              onClick={() => setDialog({ kind: 'setDefault', workflow })}
                              disabled={write.isPending}
                            >
                              Set default
                            </Button>
                          )}
                          {workflow.archivedAt ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              aria-label={`Restore ${workflow.name}`}
                              onClick={() => restore(workflow)}
                              disabled={write.isPending}
                            >
                              Restore
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              aria-label={`Archive ${workflow.name}`}
                              onClick={() => setDialog({ kind: 'archive', workflow })}
                              disabled={write.isPending}
                            >
                              Archive
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label={`Delete ${workflow.name}`}
                            onClick={() => setDialog({ kind: 'delete', workflow })}
                            disabled={write.isPending}
                          >
                            Delete
                          </Button>
                        </div>
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
                footer={`Showing ${data.items.length} of ${data.total} workflows`}
                onPageChange={setPage}
              />
            </div>
          </Card>
        )}
      </section>

      {dialog?.kind === 'create' ? (
        <ConfirmDialog
          open
          title="New workflow"
          description={
            <span className="block space-y-3">
              <span className="block">{createField('name', 'Name', { required: true, placeholder: 'e.g. BSc Software Engineering' })}</span>
              <span className="block">{createField('program', 'Program', { placeholder: 'Leave blank = any program' })}</span>
              <span className="block">{createField('academicSession', 'Academic session', { placeholder: 'e.g. 2026/2027' })}</span>
              <span className="block text-xs">
                Only one ACTIVE workflow may hold a program (FR-CW-08) — a conflict answers 409.
                Stages are added in the editor; a new workflow never steals the default flag.
              </span>
            </span>
          }
          confirmLabel="Create workflow"
          loading={write.isPending}
          onConfirm={confirm}
          onCancel={close}
        />
      ) : dialog ? (
        <ConfirmDialog
          open
          title={
            dialog.kind === 'setDefault'
              ? 'Set as the default workflow?'
              : dialog.kind === 'archive'
                ? 'Archive this workflow?'
                : 'Delete this workflow?'
          }
          description={
            dialog.kind === 'setDefault' ? (
              <>
                <strong>{dialog.workflow.name}</strong> becomes the ADR-16 fallback target:
                students with no program match resolve to it. The previous default is cleared
                in the same write.
              </>
            ) : dialog.kind === 'archive' ? (
              <>
                <strong>{dialog.workflow.name}</strong> leaves the active list and releases
                its program slot. Projects keep their frozen stage snapshots (ADR-15).
              </>
            ) : (
              <>
                Delete <strong>{dialog.workflow.name}</strong>? This answers <code>422</code>{' '}
                when any project references it — archive instead.
              </>
            )
          }
          confirmLabel={
            dialog.kind === 'setDefault'
              ? 'Set default'
              : dialog.kind === 'archive'
                ? 'Archive'
                : 'Delete'
          }
          destructive={dialog.kind === 'delete'}
          loading={write.isPending}
          onConfirm={confirm}
          onCancel={close}
        />
      ) : null}
    </div>
  );
}
