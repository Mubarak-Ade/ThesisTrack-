import { ArrowLeft, KeyRound, MessageSquare, Pencil, UserX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ApiError } from '@/lib/api/http';
import ContactCard from '../components/ContactCard';
import RoleBadge from '../components/RoleBadge';
import StatusBadge from '../components/StatusBadge';
import {
  ActivityFeed,
  AdminOversight,
  AuditLogs,
  ThesisAssignments,
} from '../components/ProfileRails';
import { ROLE_LABELS } from '../data/constants';
import type { UserDetail } from '../data/types';
import { getUser, sendInvite } from '../data/usersRepo';

function titleCaseRole(role: string): string {
  return ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role.charAt(0).toUpperCase() + role.slice(1);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link to="/" className="transition-colors hover:text-primary">
          Home
        </Link>
        <span aria-hidden="true">/</span>
        <Link to="/users" className="transition-colors hover:text-primary">
          Users
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-foreground">Profile</span>
      </nav>

      <div className="mt-2">
        <p className="text-xs font-bold uppercase tracking-widest text-primary">User Management</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-foreground sm:text-3xl">
          User Profile
        </h1>
      </div>

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
          {/* Header card */}
          <Card>
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <span className="grid size-14 shrink-0 place-items-center rounded-full bg-primary/10 text-xl font-bold text-primary">
                    {`${detail.firstName.charAt(0)}${detail.lastName.charAt(0)}`.toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-display text-xl font-bold text-foreground">
                      {detail.firstName} {detail.lastName}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {titleCaseRole(detail.role)}
                      {detail.extras.department ?? detail.department
                        ? ` • ${detail.extras.department ?? detail.department}`
                        : ''}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <RoleBadge role={detail.role} />
                      <StatusBadge status={detail.status} />
                      {detail.code && (
                        <span className="text-xs font-mono text-muted-foreground">{detail.code}</span>
                      )}
                    </div>
                    <p className="mt-3 break-all font-mono text-[11px] text-muted-foreground">
                      ID: {detail.id}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Member since {formatDate(detail.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button type="button" onClick={resetPassword} disabled={reinviting}>
                    <KeyRound aria-hidden="true" />
                    {reinviting ? 'Sending…' : 'Reset Password'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => toast.info('Editing users is not available yet')}
                  >
                    <Pencil aria-hidden="true" />
                    Edit User
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => toast.info('Direct messages are not available yet')}
                  >
                    <MessageSquare aria-hidden="true" />
                    Send Message
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="min-w-0 space-y-4 lg:col-span-2">
              <ContactCard detail={detail} />
              <ThesisAssignments detail={detail} />
              <AuditLogs detail={detail} />
              <ActivityFeed detail={detail} />
            </div>
            <div className="space-y-4">
              <AdminOversight detail={detail} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
