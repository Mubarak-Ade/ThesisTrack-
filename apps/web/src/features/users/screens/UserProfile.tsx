import { ArrowLeft, KeyRound, MoreHorizontal, Pencil, UserX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import FormMessage from '@/components/forms/FormMessage';
import { useDepartments } from '@/features/departments/hooks/useDepartments';
import { ApiError } from '@/lib/api/http';
import { useAuthStore } from '@/stores/auth';
import ContactCard from '../components/ContactCard';
import StatusBadge from '../components/StatusBadge';
import {
  ActivityFeed,
  AdminOversight,
  AuditLogs,
  ThesisAssignments,
} from '../components/ProfileRails';
import { ROLE_LABELS } from '../data/constants';
import type { ConsoleUser, UserDetail } from '../data/types';
import { getUser, sendInvite, updateUser } from '../data/usersRepo';

function titleCaseRole(role: string): string {
  return ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role.charAt(0).toUpperCase() + role.slice(1);
}

function NotFound() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-danger-bg text-danger">
          <UserX className="size-6" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">User not found</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            This account does not exist or may have been removed from the directory.
          </p>
        </div>
        <Button type="button" variant="outline" asChild>
          <Link to="/users">
            <ArrowLeft aria-hidden="true" />
            Back to all users
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/** `FAC/YY/DEPT/NNNNN` — mirrors the API's student rule (design 2026-10-28). */
const REGISTRATION_PATTERN = /^[A-Z]{2,4}\/\d{2}\/[A-Z]{2,4}\/\d{5}$/;

const SELECT_CLASS =
  'flex h-11 w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1';

/**
 * Enrollment panel — registration number and managed department are editable.
 * Students must keep a well-formed number; supervisors may optionally carry a
 * staff number. The department drives the ADR-16 workflow match, so the DEPT
 * segment is checked against its code before the save leaves the browser.
 */
function EnrollmentPanel({
  detail,
  onUpdated,
}: {
  detail: UserDetail;
  onUpdated: (user: ConsoleUser) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [registrationNumber, setRegistrationNumber] = useState(detail.registrationNumber ?? '');
  const [departmentId, setDepartmentId] = useState(detail.department?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: departmentPage, isLoading: departmentsLoading } = useDepartments();
  const departments = departmentPage?.items ?? [];
  const selectedDepartment = departments.find((department) => department.id === departmentId);
  const session = useAuthStore((s) => s.user);
  const isCoordinator = session?.role === 'coordinator';
  // A coordinator manages students/supervisors in its own department only; an
  // elevated account (or its own) is a strict 404 at the API, so never offer
  // the edit control (design 2026-11-02).
  const elevatedTarget =
    detail.role === 'coordinator' ||
    detail.role === 'administrator' ||
    detail.id === session?.id;
  const locked = isCoordinator && elevatedTarget;

  const cancel = () => {
    setRegistrationNumber(detail.registrationNumber ?? '');
    setDepartmentId(detail.department?.id ?? '');
    setError(null);
    setEditing(false);
  };

  const save = async () => {
    const trimmedRegistration = registrationNumber.trim().toUpperCase();
    if (detail.role === 'student') {
      if (!trimmedRegistration) {
        setError('Registration number is required for students');
        return;
      }
      if (!REGISTRATION_PATTERN.test(trimmedRegistration)) {
        setError('Use FAC/YY/DEPT/NNNNN, e.g. CST/22/SWE/00825');
        return;
      }
      if (selectedDepartment?.code && trimmedRegistration.split('/')[2] !== selectedDepartment.code) {
        setError(`The DEPT segment must be ${selectedDepartment.code} for the selected department`);
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateUser(detail.id, {
        registrationNumber: trimmedRegistration || null,
        // A coordinator's department control is locked; keep the stored value
        // (the API would 403 a cross-department body anyway).
        departmentId: isCoordinator
          ? (detail.department?.id ?? null)
          : departmentId || null,
      });
      onUpdated(updated);
      setEditing(false);
      toast.success('Enrollment details updated');
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Unable to save enrollment details. Check your connection and try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Enrollment
            </p>
            <h2 className="mt-1 font-display text-lg font-bold text-foreground">
              Registration &amp; Department
            </h2>
          </div>
          {!editing && !locked && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Edit enrollment"
              onClick={() => setEditing(true)}
            >
              <Pencil aria-hidden="true" />
              Edit
            </Button>
          )}
        </div>

        {locked && (
          <p className="mt-3 text-xs italic text-muted-foreground">
            Coordinators cannot edit coordinator or administrator accounts.
          </p>
        )}

        {editing ? (
          <div className="mt-4 space-y-3">
            <div className="space-y-2">
              <Label
                htmlFor="up-registration"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Registration number
                {detail.role === 'student' ? <span className="text-danger"> *</span> : null}
              </Label>
              <Input
                id="up-registration"
                value={registrationNumber}
                maxLength={32}
                placeholder="e.g. CST/22/INF/00825"
                aria-invalid={!!error}
                onChange={(event) => setRegistrationNumber(event.target.value)}
              />
              <p className="text-xs italic text-muted-foreground">
                {detail.role === 'student'
                  ? 'FAC/YY/DEPT/NNNNN — DEPT must be the department code.'
                  : 'Optional for supervisors and administrators; any staff number is accepted.'}
              </p>
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="up-department"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Department
              </Label>
              <select
                id="up-department"
                className={SELECT_CLASS}
                value={departmentId}
                disabled={departmentsLoading || isCoordinator}
                onChange={(event) => setDepartmentId(event.target.value)}
              >
                {isCoordinator ? (
                  <option value={detail.department?.id ?? ''}>
                    {detail.department
                      ? `${detail.department.name}${detail.department.code ? ` (${detail.department.code})` : ''}`
                      : 'No department'}
                  </option>
                ) : (
                  <>
                    <option value="">Unaffiliated (default workflow)</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                        {department.code ? ` (${department.code})` : ''}
                      </option>
                    ))}
                  </>
                )}
              </select>
              <p className="text-xs italic text-muted-foreground">
                {isCoordinator
                  ? 'Locked to your department (design 2026-11-02).'
                  : 'ADR-16: the department selects the student’s workflow at approval.'}
              </p>
            </div>
            {error && <FormMessage>{error}</FormMessage>}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={cancel} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <dl className="mt-4 space-y-3">
            <div className="flex items-baseline justify-between gap-3 border-b border-border/70 pb-2">
              <dt className="text-xs text-muted-foreground">Registration no.</dt>
              <dd className="text-right text-sm font-medium text-foreground">
                {detail.registrationNumber ?? '—'}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-xs text-muted-foreground">Department</dt>
              <dd className="text-right text-sm font-medium text-foreground">
                {detail.department
                  ? `${detail.department.name}${detail.department.code ? ` (${detail.department.code})` : ''}`
                  : '—'}
              </dd>
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * User Profile (mockup parity §5.4): live core + live project rails (§16.3
 * User details); Reset Password = re-invite.
 */
export default function UserProfile() {
  const { userId } = useParams<{ userId: string }>();
  const [detail, setDetail] = useState<UserDetail | null | undefined>(undefined);
  const [reinviting, setReinviting] = useState(false);

  useEffect(() => {
    let alive = true;
    setDetail(undefined);
    void getUser(userId ?? '').then((next) => {
      if (alive) setDetail(next);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const resetPassword = async () => {
    if (!detail) return;
    setReinviting(true);
    try {
      await sendInvite(detail.id);
      toast.success(`Invitation re-sent to ${detail.email}`);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'Unable to re-send the invitation. Try again.',
      );
    } finally {
      setReinviting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      {/* Breadcrumb (spec §3): ADMIN › USERS › USER DETAILS */}
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
        <span className="text-foreground">User Details</span>
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
              User Profile
            </h1>
            {detail && (
              <p className="mt-1 font-mono text-sm text-muted-foreground">
                Registration No.: {detail.registrationNumber ?? '—'}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={resetPassword}
            disabled={reinviting || !detail}
          >
            <KeyRound aria-hidden="true" />
            {reinviting ? 'Sending…' : 'Reset Password'}
          </Button>
          <Button
            type="button"
            onClick={() => toast.info('Editing users is not available yet')}
            disabled={!detail}
          >
            <Pencil aria-hidden="true" />
            Edit User
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="More profile actions"
            onClick={() => toast.info('More actions are not available yet')}
            disabled={!detail}
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </div>
      </header>

      {detail === undefined ? (
        <div className="mt-8 flex items-center gap-3 text-sm text-muted-foreground" role="status">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Loading profile…
        </div>
      ) : detail === null ? (
        <div className="mt-6">
          <NotFound />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {/* Header card: silhouette + name + ACTIVE pill + role line + counters */}
          <Card>
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  <Avatar size="xl" className="shrink-0" />
                  <div className="min-w-0">
                    <h2 className="font-display text-xl font-bold text-foreground">
                      {detail.firstName} {detail.lastName}
                    </h2>
                    <div className="mt-1.5">
                      <StatusBadge status={detail.status} className="uppercase" />
                    </div>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      {titleCaseRole(detail.role)} • {detail.department?.name ?? 'No department'}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 divide-x divide-border sm:pl-4">
                  <div className="px-4 text-center sm:px-6">
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      Theses
                    </p>
                    <p className="mt-1 font-display text-3xl font-bold text-foreground">
                      {String(detail.theses.length).padStart(2, '0')}
                    </p>
                  </div>
                  <div className="px-4 text-center sm:px-6">
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      Milestones
                    </p>
                    <p className="mt-1 font-display text-3xl font-bold text-foreground">
                      {String(detail.milestones).padStart(2, '0')}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="min-w-0 space-y-4 lg:col-span-2">
              <ThesisAssignments detail={detail} />
              <AuditLogs />
              <ActivityFeed detail={detail} />
            </div>
            <div className="space-y-4">
              <EnrollmentPanel
                key={`enrollment-${detail.id}`}
                detail={detail}
                onUpdated={(user) => setDetail((prev) => (prev ? { ...prev, ...user } : prev))}
              />
              <ContactCard detail={detail} />
              <AdminOversight detail={detail} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
