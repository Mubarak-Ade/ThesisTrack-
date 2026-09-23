import type { ReactNode } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useInvitation } from '@/lib/invitations';
import type { InvitationPreviewUser } from '@/lib/http';

function FullPageSpinner() {
  return (
    <div
      className="min-h-screen grid place-items-center"
      role="status"
      aria-label="Loading invitation"
    >
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

/**
 * Renders `children` only for a `valid` invitation; routes `invalid` and
 * `already_activated` to their status screens (plan 4.6 — shared by
 * welcome / confirm / activate, which all run the same query + redirects).
 */
export default function InvitationFlow({ children }: { children: (invitation: InvitationPreviewUser) => ReactNode }) {
  const [params] = useSearchParams();
  const token = params.get('token');
  const { data, isLoading, isError } = useInvitation(token);

  if (isLoading) return <FullPageSpinner />;

  if (isError) {
    return (
      <div className="min-h-screen grid place-items-center px-6 text-center">
        <div className="max-w-sm space-y-3">
          <p className="text-sm text-foreground">Couldn&apos;t load this invitation.</p>
          <p className="text-xs text-muted-foreground">
            Check your connection, then reopen the link from your email.
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;
  if (data.status === 'invalid') return <Navigate to="/invite/invalid" replace />;
  if (data.status === 'already_activated') {
    return <Navigate to="/invite/already-activated" replace />;
  }
  if (!data.invitation) return <Navigate to="/invite/invalid" replace />;

  return <>{children(data.invitation)}</>;
}
