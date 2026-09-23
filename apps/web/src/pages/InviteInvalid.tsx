import { ArrowLeft, EyeOff, HelpCircle, Mail, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import Callout from '@/components/Callout';
import StatusLayout from '@/components/StatusLayout';
import { Button } from '@/components/ui/button';

/**
 * 4.11 — invalid/expired/used invitation token (the flow gate lands here
 * for `status: 'invalid'`; deep links work too). The "48 hours" mockup
 * wording is corrected to the API's real 72-hour activation TTL.
 */
function InviteInvalid() {
  return (
    <StatusLayout
      image="images/invitation.jpg"
      imageAlt="Graduation cap resting on a rolled diploma certificate"
      badge="danger"
      badgeIcon={<EyeOff className="size-5" aria-hidden="true" />}
      title="Invitation link unavailable"
      subcopy="This invitation link has either expired, been previously used, or is no longer valid due to security protocols."
    >
      <Callout
        variant="info"
        className="border border-border bg-card"
        uppercase={false}
        title="Why did this happen?"
        icon={<Mail className="size-4 text-muted-foreground" aria-hidden="true" />}
      >
        <span className="block">
          Departmental invitations are time-sensitive for security reasons. Links typically expire
          after 72 hours or once the account has been successfully activated.
        </span>
        <span className="mt-3 flex gap-2 rounded-lg border border-border bg-surface-alt px-3 py-3">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>
            <span className="font-semibold">Security Policy:</span> Multiple failed activation
            attempts may temporarily flag your institutional IP address.
          </span>
        </span>
      </Callout>

      <Button className="w-full" asChild>
        <Link to="/login">
          <ArrowLeft aria-hidden="true" /> RETURN TO SIGN IN
        </Link>
      </Button>

      <Button variant="outline" className="w-full" asChild>
        <Link to="/forgot-password">
          <HelpCircle aria-hidden="true" /> Request a new link
        </Link>
      </Button>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Still having trouble accessing your research account?{' '}
        <span className="font-semibold text-foreground">Contact your Departmental Coordinator</span>{' '}
        for manual verification.
      </p>
    </StatusLayout>
  );
}

export default InviteInvalid;
