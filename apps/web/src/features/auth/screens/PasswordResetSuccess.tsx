import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import Callout from '@/components/feedback/Callout';
import StatusLayout from '@/app/layouts/StatusLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

/** 4.5 — static confirmation after POST /auth/reset-password succeeds. */
function PasswordResetSuccess() {
  return (
    <StatusLayout
      left={{ variant: 'plain' }}
      image="images/invitation.jpg"
      imageAlt="Graduation cap resting on a diploma certificate"
      badge="success"
      title="Password updated"
      subcopy="Your password has been changed successfully. You can now use your new credentials to access your ThesisTrack research workspace."
    >
      <Card>
        <CardContent className="space-y-4 p-4">
          <Button className="w-full" asChild>
            <Link to="/login">
              Sign in <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Separator />
          <p className="text-center text-xs text-muted-foreground">
            Having trouble?{' '}
            <span className="font-semibold text-foreground">Contact academic support</span>
          </p>
        </CardContent>
      </Card>

      <Callout
        variant="neutral"
        title="Security protocol"
        icon={<CheckCircle2 className="size-4 text-success" aria-hidden="true" />}
      >
        For your security, we recommend closing this tab and signing in from your primary
        university browser session.
      </Callout>
    </StatusLayout>
  );
}

export default PasswordResetSuccess;
