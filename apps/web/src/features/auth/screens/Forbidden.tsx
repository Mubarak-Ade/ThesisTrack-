import { ArrowLeft, Home, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import Callout from '@/components/feedback/Callout';
import StatusLayout from '@/app/layouts/StatusLayout';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

/**
 * 4.14 — 403: the session is fine, the role is not. The mockup's mint
 * "Restricted Area" panel comes through StatusLayout's left overrides
 * (same chrome as every other screen — the plan's "own layout" would
 * only duplicate AuthLayout).
 */
function Forbidden() {
  return (
    <StatusLayout
      left={{
        image: 'images/green-gradient.jpg',
        imageAlt: 'Abstract mint-green gradient panel',
        imageBadge: 'danger',
        headline: 'Restricted Area',
        subcopy:
          'ThesisTrack protects sensitive research data and administrative configurations. Access to this module requires specific departmental authorization.',
      }}
      eyebrow={
        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-danger">
          <Lock className="size-3.5" aria-hidden="true" /> Security protocol 403
        </span>
      }
      title="Access restricted"
      subcopy="Your current account permissions do not allow you to view this section of the ThesisTrack platform. This action has been logged for security audit purposes."
    >
      <Callout
        variant="neutral"
        uppercase={false}
        title="reason for restriction"
        icon={<Lock className="size-4 text-muted-foreground" aria-hidden="true" />}
      >
        This administrative panel is reserved for Departmental Administrators and IT Support
        personnel managing institutional research workflows.
        <span className="mt-3 block border-t border-border pt-3">
          If you believe this is an error, please contact your university&apos;s{' '}
          <span className="font-semibold">Departmental IT Administrator</span> or review your role
          assignments in your profile settings.
        </span>
      </Callout>

      {/* Row only at lg+: between md (split column starts) and lg the right
          column is too narrow for two nowrap labels side by side. */}
      <div className="flex flex-col gap-3 lg:flex-row">
        <Button className="flex-1" asChild>
          <Link to="/dashboard">
            <Home aria-hidden="true" /> GO TO DASHBOARD
          </Link>
        </Button>
        <Button variant="outline" className="flex-1" asChild>
          <Link to="/">
            <ArrowLeft aria-hidden="true" /> RETURN TO SAFETY
          </Link>
        </Button>
      </div>

      <div>
        <Separator />
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <Lock className="size-3.5 shrink-0" aria-hidden="true" />
          Compliance ID: THESIS-SEC-2026-0403
        </p>
      </div>
    </StatusLayout>
  );
}

export default Forbidden;
