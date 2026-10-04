import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { History, Search, UserCheck, UserRound } from 'lucide-react';
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
import {
  useAssignmentWrite,
  useStudentAssignment,
  useStudents,
  useSupervisors,
} from '../hooks';
import type { DirectoryStudent } from '../data';

/**
 * §16.3 Assignments — Flow C (§5.3) over the student-scoped endpoints
 * (plan 13.1): one `GET /students/:id/supervisor` fan-out per visible row,
 * then POST (assign) / PATCH (change) / DELETE (end). One active supervisor
 * per student (I13); history is preserved, never deleted (I12).
 *
 * LIVE-ONLY: assigning a fixture student cannot succeed (Rule 3).
 */
const PAGE_SIZE = 10;

type DialogState =
  | { action: 'assign' | 'change'; student: DirectoryStudent }
  | { action: 'end'; student: DirectoryStudent }
  | null;

/** One directory row + its own assignment read (§11.1 fan-out). */
function AssignmentRow({
  student,
  expanded,
  onToggle,
  onAssign,
  onChange,
  onEnd,
  busy,
}: {
  student: DirectoryStudent;
  expanded: boolean;
  onToggle: () => void;
  onAssign: () => void;
  onChange: () => void;
  onEnd: () => void;
  busy: boolean;
}) {
  const query = useStudentAssignment(student.id);
  const active = query.data?.active ?? null;
  const history = query.data?.history ?? [];

  return (
    <>
      <tr className="border-b border-border last:border-0 hover:bg-accent/40">
        <td className="px-5 py-3.5">
          <p className="truncate font-semibold text-foreground">{student.name}</p>
          <p className="truncate text-xs text-muted-foreground">{student.email}</p>
          <p className="truncate text-xs text-muted-foreground">
            {student.program ?? 'Unaffiliated — default workflow (ADR-16)'}
          </p>
        </td>
        <td className="px-3 py-3.5">
          {query.isPending ? (
            <span className="text-xs text-muted-foreground" role="status">
              Loading…
            </span>
          ) : active ? (
            <>
              <p className="truncate text-sm text-foreground">{active.supervisor.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                since {active.assignedAt ? formatRelative(active.assignedAt) : '—'}
              </p>
            </>
          ) : (
            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-700">
              Unassigned
            </span>
          )}
        </td>
        <td className="px-3 py-3.5 text-xs text-muted-foreground">
          {student.isActive ? 'Active' : 'Inactive'}
        </td>
        <td className="px-3 py-3.5">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {history.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-expanded={expanded}
                aria-label={`History for ${student.name}`}
                onClick={onToggle}
              >
                <History aria-hidden="true" />
                {history.length}
              </Button>
            )}
            {active ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Change supervisor for ${student.name}`}
                  onClick={onChange}
                  disabled={busy}
                >
                  Change
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`End supervisor for ${student.name}`}
                  onClick={onEnd}
                  disabled={busy}
                >
                  End
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                aria-label={`Assign supervisor to ${student.name}`}
                onClick={onAssign}
                disabled={busy}
              >
                <UserCheck aria-hidden="true" />
                Assign
              </Button>
            )}
          </div>
        </td>
      </tr>
      {expanded && history.length > 0 && (
        <tr className="border-b border-border bg-surface-alt/50">
          <td colSpan={4} className="px-5 py-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Assignment history
            </p>
            <ul className="mt-2 space-y-1.5">
              {history.map((entry) => (
                <li key={entry.id} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{entry.supervisor.name}</span>{' '}
                  — {entry.assignedAt ? formatRelative(entry.assignedAt) : 'unknown start'}
                  {entry.endedAt ? ` → ${formatRelative(entry.endedAt)}` : ' → (ended)'}
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AdminAssignments() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [supervisorId, setSupervisorId] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const students = useStudents({ page, limit: PAGE_SIZE, q: q || undefined });
  const supervisors = useSupervisors({ limit: 100 });
  const write = useAssignmentWrite();
  const data = students.data;
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  const onSearch = (value: string) => {
    setSearch(value);
    setPage(1);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setQ(value), 300);
  };

  const openDialog = (state: DialogState) => {
    setSupervisorId('');
    setDialog(state);
  };

  const confirm = () => {
    if (!dialog) return;
    if (dialog.action !== 'end' && !supervisorId) {
      toast.error('Choose a supervisor first.');
      return;
    }
    write.mutate(
      {
        studentId: dialog.student.id,
        action: dialog.action,
        supervisorId: supervisorId || undefined,
      },
      {
        onSuccess: () => {
          toast.success(
            dialog.action === 'assign'
              ? 'Supervisor assigned.'
              : dialog.action === 'change'
                ? 'Supervisor changed — the previous relationship is kept as history.'
                : 'Supervisor assignment ended — history is preserved.',
          );
          setDialog(null);
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const picker = dialog && dialog.action !== 'end' ? (
    <label className="mt-3 block">
      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Supervisor
      </span>
      <select
        value={supervisorId}
        onChange={(event) => setSupervisorId(event.target.value)}
        className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        aria-label="Supervisor"
      >
        <option value="">Choose a supervisor…</option>
        {(supervisors.data?.items ?? []).map((supervisor) => (
          <option key={supervisor.id} value={supervisor.id} disabled={!supervisor.isActive}>
            {supervisor.name} ({supervisor.email}
            {supervisor.isActive ? '' : ' — inactive'})
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-muted-foreground">
        One active supervisor per student (I13); inactive accounts cannot be chosen (422).
      </span>
    </label>
  ) : null;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <span>Admin</span>
        <span aria-hidden="true">›</span>
        <span className="text-foreground">Assignments</span>
      </nav>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
            Supervisor Assignments
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Flow C (§5.3): assign, change or end a student&apos;s supervisor. Each student has
            at most one active supervisor; history is never deleted (I12/I13).
          </p>
        </div>
      </header>

      <Card className="mt-6">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Students</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Assignment state per student, read live from{' '}
              <code>/students/:id/supervisor</code>.
            </p>
          </div>
          <div className="relative min-w-0 flex-1 sm:w-64">
            <Input
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Search students…"
              aria-label="Search students"
              className="pr-9"
            />
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
          </div>
        </CardContent>
      </Card>

      <section className="mt-4" aria-label="Assignment list">
        {students.isPending ? (
          <LoadingState label="Loading assignments…" />
        ) : students.isError ? (
          <ErrorState
            message="Assignments could not be loaded right now."
            onRetry={() => void students.refetch()}
          />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={<UserRound className="size-5" />}
            eyebrow="Nothing here yet"
            title="No students match"
            description="Provision students from the Users screen — assignments follow (Flow A → Flow C)."
            action={
              <Button asChild>
                <Link to="/users">Go to Users</Link>
              </Button>
            }
          />
        ) : (
          <Card>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
                <colgroup>
                  <col style={{ width: '36%' }} />
                  <col style={{ width: '28%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '24%' }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="px-5 py-3 font-semibold">Student</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Active supervisor</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Account</th>
                    <th scope="col" className="px-3 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((student) => (
                    <AssignmentRow
                      key={student.id}
                      student={student}
                      expanded={expandedId === student.id}
                      onToggle={() =>
                        setExpandedId((current) => (current === student.id ? null : student.id))
                      }
                      onAssign={() => openDialog({ action: 'assign', student })}
                      onChange={() => openDialog({ action: 'change', student })}
                      onEnd={() => openDialog({ action: 'end', student })}
                      busy={write.isPending}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-4">
              <Pagination
                page={page}
                pageCount={pageCount}
                loading={students.isFetching}
                footer={`Showing ${data.items.length} of ${data.total} students`}
                onPageChange={setPage}
              />
            </div>
          </Card>
        )}
      </section>

      <ConfirmDialog
        open={dialog !== null}
        title={
          dialog?.action === 'assign'
            ? 'Assign this supervisor?'
            : dialog?.action === 'change'
              ? 'Change the supervisor?'
              : 'End the assignment?'
        }
        description={
          dialog?.action === 'end' ? (
            <>
              The active assignment for <strong>{dialog.student.name}</strong> ends now. The
              row stays as history (I12) — you can assign a new supervisor afterwards.
            </>
          ) : (
            <>
              {dialog?.action === 'change'
                ? 'The current assignment ends and the new one begins in one transaction — history keeps both. '
                : ''}
              Student: <strong>{dialog?.student.name}</strong>.
              {picker}
            </>
          )
        }
        confirmLabel={
          dialog?.action === 'assign'
            ? 'Assign'
            : dialog?.action === 'change'
              ? 'Change supervisor'
              : 'End assignment'
        }
        destructive={dialog?.action === 'end'}
        loading={write.isPending}
        onConfirm={confirm}
        onCancel={() => setDialog(null)}
      />
    </div>
  );
}
