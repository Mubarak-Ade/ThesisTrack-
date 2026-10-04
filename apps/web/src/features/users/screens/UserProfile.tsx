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
import { ApiError } from '@/lib/api/http';
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

/** Fixture counters in the header card (spec §5.4). */
const MILESTONES = '14';
const DEPT_FALLBACK = 'Informatics & AI';

/** Honest helper copy for the §11.0.2 `program` field (ADR-16 auto-match). */
const PROGRAM_HINT =
  'ADR-16: the student’s program selects their workflow at approval; blank = default workflow.';

/**
 * §11.0.2 `program` (ADR-16 workflow auto-match key): read-only until "Edit".
 * Blank on save → `null` (clears it); failures render inline and the editor
 * stays open — writes never fake success (Rule 3).
 */
function ProgramPanel({
  detail,
  onUpdated,
}: {
  detail: UserDetail;
  onUpdated: (user: ConsoleUser) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(detail.program ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = () => {
    setDraft(detail.program ?? '');
    setError(null);
    setEditing(false);
  };

  const save = async () => {
    const trimmed = draft.trim();
    const program = trimmed === '' ? null : trimmed;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateUser(detail.id, { program });
      onUpdated(updated);
      setEditing(false);
      toast.success('Program updated');
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Unable to save the program. Check your connection and try again.',
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
              Workflow
            </p>
            <h2 className="mt-1 font-display text-lg font-bold text-foreground">
              Program (workflow match)
            </h2>
          </div>
          {!editing && (
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil aria-hidden="true" />
              Edit
            </Button>
          )}
        </div>

        {editing ? (
          <div className="mt-4 space-y-2">
            <Label
              htmlFor="up-program"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Program
            </Label>
            <Input
              id="up-program"
              value={draft}
              maxLength={255}
              placeholder="e.g. MSc Computer Science"
              aria-invalid={!!error}
              onChange={(event) => setDraft(event.target.value)}
            />
            <p className="text-xs italic text-muted-foreground">{PROGRAM_HINT}</p>
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
          <>
            <p className="mt-3 break-words text-sm text-foreground">{detail.program ?? '—'}</p>
            <p className="mt-1.5 text-xs italic text-muted-foreground">{PROGRAM_HINT}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** User Profile (spec §5.4): live core + fixture rails; Reset Password = re-invite. */
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
                ID: {detail.code || detail.id}
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
                      {titleCaseRole(detail.role)} •{' '}
                      {detail.extras.department ?? detail.department ?? DEPT_FALLBACK}
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
                      {MILESTONES}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="min-w-0 space-y-4 lg:col-span-2">
              <ThesisAssignments detail={detail} />
              <AuditLogs detail={detail} />
              <ActivityFeed detail={detail} />
            </div>
            <div className="space-y-4">
              <ProgramPanel
                key={detail.id}
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
