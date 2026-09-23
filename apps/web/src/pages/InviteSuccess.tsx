import { useState } from 'react';
import { ArrowRight, Rocket, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Callout from '@/components/Callout';
import StatusLayout from '@/components/StatusLayout';
import { Button } from '@/components/ui/button';
import { refreshSession } from '@/lib/http';

/**
 * 4.9 — activation landed. The account is active but there is no session
 * yet, so "Continue to dashboard" attempts a refresh: success means a
 * session exists → /dashboard; otherwise fall back to /login (plan 4.9).
 */
function InviteSuccess() {
  const navigate = useNavigate();
  const [trying, setTrying] = useState(false);

  async function handleContinue() {
    setTrying(true);
    try {
      await refreshSession();
      navigate('/dashboard', { replace: true });
    } catch {
      navigate('/login', { replace: true });
    }
  }

  return (
    <StatusLayout
      image="images/graduation-success.jpg"
      imageAlt="Smiling graduate in cap and gown holding a certificate"
      badge="success"
      title="Your account is ready"
      subcopy="Account activated — you can now sign in and start tracking milestones with your supervisor."
    >
      <Callout
        variant="info"
        title="Institutional access"
        icon={<ShieldCheck className="size-4 text-success" aria-hidden="true" />}
      >
        Your ThesisTrack account is now linked to your university credentials.
      </Callout>

      <Callout
        variant="info"
        title="Next steps"
        icon={<Rocket className="size-4 text-success" aria-hidden="true" />}
      >
        Complete your research profile, then request supervisor matches to get started.
      </Callout>

      <Button className="w-full" onClick={handleContinue} disabled={trying}>
        {trying ? (
          'Continuing…'
        ) : (
          <>
            CONTINUE TO DASHBOARD <ArrowRight aria-hidden="true" />
          </>
        )}
      </Button>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Questions about your invitation?{' '}
        <span className="font-semibold text-foreground">Contact your Department Coordinator</span>
      </p>
    </StatusLayout>
  );
}

export default InviteSuccess;
