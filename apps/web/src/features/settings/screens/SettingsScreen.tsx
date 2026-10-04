import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import LoadingState from '@/components/feedback/LoadingState';
import ErrorState from '@/components/feedback/ErrorState';
import { signOut } from '@/lib/auth/signOut';
import { useAuthStore } from '@/stores/auth';
import { usePasswordReset, useProfile } from '../hooks/useSettings';

const ROLE_LABEL: Record<string, string> = {
  administrator: 'Administrator',
  supervisor: 'Supervisor',
  student: 'Student',
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{value}</dd>
    </div>
  );
}

/**
 * §16.3 Settings — profile (live `/auth/me`), security (the one password
 * write the API offers: the emailed reset link, §11.0.1) and session. No
 * field the API cannot persist is rendered as an editable control.
 */
export default function SettingsScreen() {
  const navigate = useNavigate();
  const profile = useProfile();
  const reset = usePasswordReset();
  const [resetSent, setResetSent] = useState<string | null>(null);
  const localUser = useAuthStore((s) => s.user);
  const user = profile.data ?? localUser;

  if (profile.isPending && !user) {
    return (
      <div className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6 sm:py-8">
        <LoadingState label="Loading settings…" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6 sm:py-8">
        <ErrorState
          message="Your profile could not be loaded."
          onRetry={() => void profile.refetch()}
        />
      </div>
    );
  }

  const sendReset = () => {
    reset.mutate(user.email, {
      onSuccess: (message) => setResetSent(message),
      onError: (error: Error) => toast.error(error.message || 'Could not send the reset link.'),
    });
  };

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6 sm:py-8">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <span>Home</span>
        <span aria-hidden="true">›</span>
        <span className="text-foreground">Settings</span>
      </nav>

      <header className="mt-3">
        <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your account, security and session — the fields below match what ThesisTrack stores.
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserRound className="size-4 text-primary" aria-hidden="true" /> Profile
            </CardTitle>
            <CardDescription>As recorded by your department.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <Field label="Name" value={`${user.firstName} ${user.lastName}`.trim()} />
              <Field label="Email" value={user.email} />
              <Field label="Role" value={ROLE_LABEL[user.role] ?? user.role} />
              <Field label="Registration number" value={user.registrationNumber ?? '—'} />
              <Field label="Program" value={user.program ?? '—'} />
              <Field label="Account status" value={user.isActive ? 'Active' : 'Inactive'} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4 text-primary" aria-hidden="true" /> Security
            </CardTitle>
            <CardDescription>
              ThesisTrack has no in-app password form — a reset link is sent to your inbox and the
              change happens on the reset screen.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" disabled={reset.isPending} onClick={sendReset}>
                <KeyRound aria-hidden="true" />
                {reset.isPending ? 'Sending…' : 'Email me a password reset link'}
              </Button>
            </div>
            <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
              {resetSent ?? ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LogOut className="size-4 text-primary" aria-hidden="true" /> Session
            </CardTitle>
            <CardDescription>
              Sessions renew automatically while you work. Signing out revokes this device.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="destructive" onClick={() => void signOut(navigate)}>
              <LogOut aria-hidden="true" /> Sign out
            </Button>
            <Separator orientation="vertical" className="hidden h-8 sm:block" />
            <p className="text-sm text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{user.email}</span>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
