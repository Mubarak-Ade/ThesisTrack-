import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import Callout from '@/components/Callout';
import InvitationFlow from '@/components/InvitationFlow';
import StatusLayout from '@/components/StatusLayout';
import { Button } from '@/components/ui/button';

/**
 * 4.6 — invitation landing. The flow gate routes invalid/already-used
 * tokens away; a valid one continues to the identity confirmation.
 */
function InviteWelcome() {
  const [params] = useSearchParams();
  const token = params.get('token');

  return (
    <InvitationFlow>
      {() => (
        <StatusLayout
          image="images/invitation.jpg"
          imageAlt="Graduation cap resting on a rolled diploma certificate"
          title="Welcome to ThesisTrack"
          subcopy="Your department has created a ThesisTrack account for you. You're one step away from streamlining your research journey."
        >
          <Callout
            variant="info"
            className="border border-border bg-card"
            uppercase={false}
            title="institutional access granted"
            icon={
              <span className="grid size-6 place-items-center rounded-full bg-success-bg">
                <CheckCircle2 className="size-3.5 text-success" aria-hidden="true" />
              </span>
            }
          >
            Use your university credentials to access all features including supervisor matching
            and milestone tracking.
          </Callout>

          <Button className="w-full" asChild>
            <Link to={`/invite/confirm?token=${encodeURIComponent(token ?? '')}`}>
              CONTINUE TO ACCOUNT <ArrowRight aria-hidden="true" />
            </Link>
          </Button>

          <p className="text-xs leading-relaxed text-muted-foreground">
            By continuing, you agree to ThesisTrack&apos;s institutional guidelines and research
            ethics standards.
          </p>
        </StatusLayout>
      )}
    </InvitationFlow>
  );
}

export default InviteWelcome;
