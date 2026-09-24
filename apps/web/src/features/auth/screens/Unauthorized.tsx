import { HelpCircle, Lock, LogIn, ShieldCheck } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import Callout from '@/components/feedback/Callout';
import StatusLayout from '@/app/layouts/StatusLayout';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

/** Shape RequireAuth puts on location.state when it bounces here. */
interface FromState {
  from?: string;
}

/**
 * Only internal paths become `?next=` — mirrors the Login page's
 * open-redirect guard (spec §7) so a crafted state can't send users
 * off-site after authentication.
 */
function safeNext(from?: string): string {
  if (from && from.startsWith('/') && !from.startsWith('//')) {
    return `?next=${encodeURIComponent(from)}`;
  }
  return '';
}

/** 4.13 — guard bounce: no active session for a protected route. */
function Unauthorized() {
  const location = useLocation();
  const state = (location.state ?? {}) as FromState;

  return (
    <StatusLayout
      image="images/invitation.jpg"
      imageAlt="A graduation cap resting on a diploma certificate"
      eyebrow={
        <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger-bg px-3 py-1 text-xs font-semibold uppercase tracking-wider text-danger">
          <Lock className="size-3.5" aria-hidden="true" /> Access restricted
        </span>
      }
      title="Sign in required"
      subcopy="You're seeing this page because you tried to reach ThesisTrack without an active session. Sign in with your institutional credentials to continue."
    >
      <Callout
        variant="neutral"
        title="Protected academic data"
        icon={<ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />}
      >
        Thesis drafts, supervisor feedback, and milestone records are only visible to
        authenticated members of your department.
      </Callout>

      <Button className="w-full" asChild>
        <Link to={`/login${safeNext(state.from)}`}>
          <LogIn aria-hidden="true" /> Sign in to ThesisTrack
        </Link>
      </Button>

      <Button variant="outline" className="w-full" asChild>
        <a href="#">
          <HelpCircle aria-hidden="true" /> Contact Department Support
        </a>
      </Button>

      <div>
        <Separator />
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
          Verified Institutional Access Gateway
        </p>
      </div>
    </StatusLayout>
  );
}

export default Unauthorized;
