import { CheckCircle2, HelpCircle, Info, LogIn } from 'lucide-react';
import { Link } from 'react-router-dom';
import Callout from '@/components/feedback/Callout';
import StatusLayout from '@/app/layouts/StatusLayout';
import { Button } from '@/components/ui/button';

/** 4.10 — the link was already consumed; guide the user to sign in. */
function InviteAlreadyActivated() {
  return (
    <StatusLayout
      image="images/graduation-success.jpg"
      imageAlt="Smiling graduate in cap and gown holding a certificate"
      badge="success"
      title="Account already activated"
      subcopy="The account associated with this invitation link has already been verified and is ready for use."
    >
      <Callout
        variant="info"
        className="border border-border bg-card"
        uppercase={false}
        title="access is active"
        icon={
          <span className="grid size-6 place-items-center rounded-full bg-success-bg">
            <CheckCircle2 className="size-3.5 text-success" aria-hidden="true" />
          </span>
        }
      >
        <span className="block">
          You have access to your research dashboard, milestone tracking, and supervisor
          communication tools.
        </span>
        <span className="mt-3 flex gap-2 rounded-lg bg-surface-alt px-3 py-3">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>
            If you don&apos;t remember your credentials, please use the &ldquo;Forgot
            Password&rdquo; option on the sign-in page.
          </span>
        </span>
      </Callout>

      <Button className="w-full" asChild>
        <Link to="/login">
          <LogIn aria-hidden="true" /> Sign in to your account
        </Link>
      </Button>

      <Button variant="outline" className="w-full" asChild>
        <a href="#">
          <HelpCircle aria-hidden="true" /> Contact departmental IT help
        </a>
      </Button>

      <p className="text-xs leading-relaxed text-muted-foreground">
        This account is managed by your university&apos;s academic department.
        <br />
        All research activities are subject to institutional ethical guidelines.
      </p>
    </StatusLayout>
  );
}

export default InviteAlreadyActivated;
