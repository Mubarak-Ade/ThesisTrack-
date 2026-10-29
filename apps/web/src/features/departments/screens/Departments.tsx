import { useEffect, useState } from 'react';
import { Building2, Plus, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';

import ConfirmDialog from '@/components/feedback/ConfirmDialog';
import EmptyState from '@/components/feedback/EmptyState';
import ErrorState from '@/components/feedback/ErrorState';
import LoadingState from '@/components/feedback/LoadingState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import Pagination, { PAGE_SIZES } from '@/components/ui/pagination';
import { ApiError } from '@/lib/api/http';
import { useCreateDepartment, useDepartments, useUpdateDepartment } from '../hooks/useDepartments';
import type { Department } from '../data/types';

/**
 * §16.3 Departments — the administrator-managed list behind every account
 * (design 2026-10-28, PROPOSED ADR-11 reversal). One flat list: a department
 * *is* the program, so the same row feeds the user form, the registration
 * number's DEPT segment and the ADR-16 workflow match.
 *
 * Rows are archived, never deleted, so historical accounts keep their label.
 * A legacy row backfilled without a code shows the completeness banner: an
 * admin completes it here, and the code becomes the DEPT segment.
 *
 * LIVE-ONLY: every row is a write target (Rule 3).
 */
const CODE_PATTERN = /^[A-Z]{2,4}$/;
const DEFAULT_LIMIT = PAGE_SIZES[1]!;

type DialogState =
  | { kind: 'create' }
  | { kind: 'edit'; department: Department }
  | { kind: 'archive'; department: Department }
  | null;

interface DepartmentForm {
  name: string;
  code: string;
}

/** Shared dialog body — the API accepts the same two fields for create/edit. */
function DepartmentFields({
  idPrefix,
  form,
  onChange,
}: {
  idPrefix: string;
  form: DepartmentForm;
  onChange: (next: DepartmentForm) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label
          htmlFor={`${idPrefix}-name`}
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Department name
        </label>
        <Input
          id={`${idPrefix}-name`}
          value={form.name}
          maxLength={255}
          placeholder="e.g. Software Engineering"
          onChange={(event) => onChange({ ...form, name: event.target.value })}
        />
      </div>
      <div className="space-y-2">
        <label
          htmlFor={`${idPrefix}-code`}
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Code
        </label>
        <Input
          id={`${idPrefix}-code`}
          value={form.code}
          maxLength={4}
          placeholder="e.g. SWE"
          onChange={(event) => onChange({ ...form, code: event.target.value.toUpperCase() })}
        />
        <p className="text-xs italic text-muted-foreground">
          2–4 letters. This is the DEPT segment students must use, e.g. CST/22/SWE/00825.
        </p>
      </div>
    </div>
  );
}

export default function Departments() {
  const [includeArchived, setIncludeArchived] = useState(false);
  const [missingOnly, setMissingOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [dialog, setDialog] = useState<DialogState>(null);

  const [form, setForm] = useState<DepartmentForm>({ name: '', code: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const query = useDepartments({
    includeArchived,
    missingCode: missingOnly,
    page,
    limit,
  });
  // Grandfathering banner: legacy rows the backfill could not code.
  const missingProbe = useDepartments({ missingCode: true, page: 1, limit: 1 });
  const create = useCreateDepartment();
  const update = useUpdateDepartment();

  const data = query.data;
  const missingCount = missingProbe.data?.total ?? 0;
  const pageCount = data ? Math.max(1, Math.ceil(data.total / limit)) : 1;
  const saving = create.isPending || update.isPending;

  // A new page/filter must not keep a stale dialog target on screen.
  useEffect(() => {
    setDialog(null);
    setArchiveError(null);
  }, [page, limit, includeArchived, missingOnly]);

  const openCreate = () => {
    setForm({ name: '', code: '' });
    setFormError(null);
    setDialog({ kind: 'create' });
  };

  const openEdit = (department: Department) => {
    setForm({ name: department.name, code: department.code ?? '' });
    setFormError(null);
    setDialog({ kind: 'edit', department });
  };

  const openArchive = (department: Department) => {
    setArchiveError(null);
    setDialog({ kind: 'archive', department });
  };

  const submitForm = async () => {
    const name = form.name.trim();
    const code = form.code.trim().toUpperCase();
    if (!name) {
      setFormError('Department name is required');
      return;
    }
    if (!CODE_PATTERN.test(code)) {
      setFormError('Code must be 2–4 letters, e.g. SWE');
      return;
    }
    if (!dialog || (dialog.kind !== 'create' && dialog.kind !== 'edit')) return;

    setFormError(null);
    try {
      if (dialog.kind === 'create') {
        await create.mutateAsync({ name, code });
        toast.success(`Department "${name}" created.`);
      } else {
        await update.mutateAsync({ id: dialog.department.id, input: { name, code } });
        toast.success('Department updated.');
      }
      setDialog(null);
    } catch (error) {
      // 409 conflict surfaces verbatim; the dialog stays open to be corrected.
      setFormError(
        error instanceof ApiError ? error.message : 'Unable to save the department. Try again.',
      );
    }
  };

  const confirmArchive = async () => {
    if (dialog?.kind !== 'archive') return;
    setArchiveError(null);
    try {
      await update.mutateAsync({ id: dialog.department.id, input: { archived: true } });
      toast.success('Department archived — it stays on historical accounts.');
      setDialog(null);
    } catch (error) {
      // 409 while an ACTIVE workflow holds the slot — say which one.
      setArchiveError(
        error instanceof ApiError ? error.message : 'Unable to archive the department. Try again.',
      );
    }
  };

  const restore = (department: Department) => {
    update.mutate(
      { id: department.id, input: { archived: false } },
      {
        onSuccess: () => toast.success('Department restored.'),
        onError: (error) => {
          toast.error(
            error instanceof ApiError
              ? error.message
              : 'Unable to restore the department. Try again.',
          );
        },
      },
    );
  };

  const reviewMissing = () => {
    setMissingOnly(true);
    setIncludeArchived(false);
    setPage(1);
  };

  const isEditing = dialog?.kind === 'create' || dialog?.kind === 'edit';

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <span>Admin</span>
        <span aria-hidden="true">›</span>
        <span className="text-foreground">Departments</span>
      </nav>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
            Departments
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            The managed list behind every account: department, program and the student&apos;s
            registration-number DEPT segment are the same row here (ADR-16).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {missingOnly && (
            <Button type="button" variant="outline" onClick={() => setMissingOnly(false)}>
              Show all departments
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            aria-pressed={includeArchived}
            onClick={() => {
              setIncludeArchived((value) => !value);
              setPage(1);
            }}
          >
            {includeArchived ? 'Hiding archived' : 'Showing archived'}
          </Button>
          <Button type="button" onClick={openCreate}>
            <Plus aria-hidden="true" />
            New department
          </Button>
        </div>
      </header>

      {missingCount > 0 && (
        <div
          role="status"
          className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <p className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              <strong>{missingCount}</strong>{' '}
              {missingCount === 1 ? 'department needs' : 'departments need'} a code. Students
              there cannot hold a valid registration number until you add one.
            </span>
          </p>
          <Button type="button" variant="outline" size="sm" onClick={reviewMissing}>
            Review departments
          </Button>
        </div>
      )}

      <section className="mt-6" aria-label="Department list">
        {query.isPending ? (
          <LoadingState label="Loading departments…" />
        ) : query.isError ? (
          <ErrorState
            message="Departments could not be loaded right now."
            onRetry={() => void query.refetch()}
          />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={<Building2 className="size-5" />}
            eyebrow="Managed list"
            title={
              missingOnly
                ? 'Every department has a code'
                : includeArchived
                  ? 'No departments yet'
                  : 'No active departments'
            }
            description={
              missingOnly
                ? 'Legacy rows are complete — nothing blocks a registration number any more.'
                : 'Create the first department: its name labels accounts, its code is the DEPT segment in registration numbers. The seeded list is a starting point.'
            }
            action={
              !missingOnly ? (
                <Button type="button" onClick={openCreate}>
                  <Plus aria-hidden="true" />
                  New department
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Card>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[860px] table-fixed border-collapse text-sm">
                <colgroup>
                  <col style={{ width: '30%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '24%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '12%' }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Department
                    </th>
                    <th scope="col" className="px-3 py-3 font-semibold">
                      Code
                    </th>
                    <th scope="col" className="px-3 py-3 font-semibold">
                      Students
                    </th>
                    <th scope="col" className="px-3 py-3 font-semibold">
                      Active workflow
                    </th>
                    <th scope="col" className="px-3 py-3 font-semibold">
                      State
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((department) => (
                    <tr
                      key={department.id}
                      className="border-b border-border last:border-0 hover:bg-accent/40"
                    >
                      <td className="px-5 py-3.5">
                        <span className="block truncate font-semibold text-foreground">
                          {department.name}
                        </span>
                      </td>
                      <td className="px-3 py-3.5">
                        {department.code ? (
                          <span className="font-mono text-sm text-foreground">
                            {department.code}
                          </span>
                        ) : (
                          <Badge variant="secondary">Missing code</Badge>
                        )}
                      </td>
                      <td className="px-3 py-3.5 text-sm text-muted-foreground">
                        {department.studentCount}
                      </td>
                      <td className="px-3 py-3.5 text-sm text-foreground">
                        {department.activeWorkflow ? (
                          department.activeWorkflow.name
                        ) : (
                          <span className="text-muted-foreground">Any (fallback)</span>
                        )}
                      </td>
                      <td className="px-3 py-3.5">
                        <Badge variant={department.archived ? 'secondary' : 'default'}>
                          {department.archived ? 'Archived' : 'Active'}
                        </Badge>
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label={`Edit ${department.name}`}
                            onClick={() => openEdit(department)}
                            disabled={saving}
                          >
                            Edit
                          </Button>
                          {department.archived ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              aria-label={`Restore ${department.name}`}
                              onClick={() => restore(department)}
                              disabled={saving}
                            >
                              Restore
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              aria-label={`Archive ${department.name}`}
                              onClick={() => openArchive(department)}
                              disabled={saving}
                            >
                              Archive
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Show
                <select
                  aria-label="Rows per page"
                  value={limit}
                  onChange={(event) => {
                    setLimit(Number(event.target.value));
                    setPage(1);
                  }}
                  className="h-9 rounded-md border border-input bg-white px-2 text-sm"
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <Pagination
                page={page}
                pageCount={pageCount}
                loading={query.isFetching}
                footer={`Showing ${data.items.length} of ${data.total} departments`}
                onPageChange={setPage}
              />
            </div>
          </Card>
        )}
      </section>

      {isEditing && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setDialog(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="department-dialog-title"
            className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-2xl"
          >
            <h2
              id="department-dialog-title"
              className="font-display text-xl font-semibold text-foreground"
            >
              {dialog.kind === 'create' ? 'New department' : `Edit ${dialog.department.name}`}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              One flat list — this name and code feed accounts, registration numbers and the
              workflow match.
            </p>
            <div className="mt-4">
              <DepartmentFields idPrefix="department-dialog" form={form} onChange={setForm} />
            </div>
            {formError && (
              <p role="alert" className="mt-3 text-sm font-medium text-danger">
                {formError}
              </p>
            )}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialog(null)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="button" onClick={() => void submitForm()} disabled={saving}>
                {dialog.kind === 'create' ? 'Create department' : 'Save changes'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={dialog?.kind === 'archive'}
        title={dialog?.kind === 'archive' ? `Archive ${dialog.department.name}?` : 'Archive'}
        description={
          dialog?.kind === 'archive' ? (
            <div className="space-y-2">
              <p>
                The row stays on historical accounts, but it leaves the picker for new accounts
                and workflows. Its {dialog.department.studentCount}{' '}
                {dialog.department.studentCount === 1 ? 'student keeps' : 'students keep'} the
                label.
              </p>
              {dialog.department.activeWorkflow && (
                <p>
                  Active workflow <strong>{dialog.department.activeWorkflow.name}</strong> holds
                  this department&apos;s slot — archive it first.
                </p>
              )}
              {archiveError && (
                <p role="alert" className="font-medium text-danger">
                  {archiveError}
                </p>
              )}
            </div>
          ) : undefined
        }
        confirmLabel="Archive department"
        destructive
        loading={update.isPending}
        onConfirm={() => void confirmArchive()}
        onCancel={() => setDialog(null)}
      />
    </div>
  );
}
