import { Clock, LogIn, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import Callout from '@/components/Callout';
import StatusLayout from '@/components/StatusLayout';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

/**
 * 4.12 — session died (refresh failed or explicit sign-out). Static route,
 * no API calls: the user is here precisely because there is no session.
 */
function SessionExpired() {
  return (
    <StatusLayout
      image="images/thumbs-up.jpg"
      imageAlt="A hand giving a thumbs-up against a plain background"
      title="Your session has expired"
      subcopy="For your security, ThesisTrack automatically ends your session after a period of inactivity to protect your research and institutional data."
    >
      <Callout
        variant="neutral"
        uppercase={false}
        title="security protocol"
        icon={<Clock className="size-4 text-muted-foreground" aria-hidden="true" />}
      >
        All unsaved progress may have been cleared. Please sign back in to resume your work where
        you left off.
      </Callout>

      <Button className="w-full" asChild>
        <Link to="/login">
          <LogIn aria-hidden="true" /> SIGN IN TO CONTINUE
        </Link>
      </Button>

      <div>
        <Separator />
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
          Institutional Security Access Only
        </p>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Unable to sign back in?{' '}
          <span className="font-semibold text-foreground">Contact IT Support</span>
        </p>
      </div>
    </StatusLayout>
  );
}

export default SessionExpired;
