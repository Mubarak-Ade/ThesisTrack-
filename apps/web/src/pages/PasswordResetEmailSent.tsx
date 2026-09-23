import { useState } from 'react';
import { CheckCircle2, ChevronLeft, RotateCcw } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Callout from '@/components/Callout';
import FormMessage from '@/components/FormMessage';
import StatusLayout from '@/components/StatusLayout';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ApiError, api } from '@/lib/http';

interface SentState {
  email?: string;
}

/** 4.3 — "Check your email": resend against the address passed via state. */
function PasswordResetEmailSent() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state ?? {}) as SentState;
  const email = state.email;

  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleResend() {
    // Deep link straight to this screen without an email → send the user
    // back to the form (plan 4.3 fallback).
    if (!email) {
      navigate('/forgot-password');
      return;
    }

    setStatus('sending');
    setErrorMessage(null);
    try {
      await api.post('/auth/forgot-password', { email });
      setStatus('sent');
    } catch (error) {
      setStatus('error');
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : 'Unable to reach ThesisTrack. Check your connection and try again.',
      );
    }
  }

  const sending = status === 'sending';

  return (
    <StatusLayout
      image="images/envelope.jpg"
      imageAlt="A stack of red envelopes ready for delivery"
      title="Check your email"
      subcopy="If an account exists for this email, you'll receive password reset instructions shortly."
    >
      {status === 'sent' && (
        <FormMessage variant="success">A new reset link has been sent.</FormMessage>
      )}
      {status === 'error' && errorMessage && <FormMessage>{errorMessage}</FormMessage>}

      <Callout
        variant="neutral"
        title="Next steps"
        icon={<CheckCircle2 className="size-4 text-success" aria-hidden="true" />}
      >
        Please check your inbox and spam folder. The link will remain active for the next 60
        minutes.
      </Callout>

      <Button className="w-full" onClick={handleResend} disabled={sending}>
        <RotateCcw aria-hidden="true" />
        {sending ? 'Sending…' : status === 'sent' ? 'Link sent again' : 'Resend email'}
      </Button>

      <Button variant="outline" className="w-full" disabled={sending} asChild>
        <Link to="/login">
          <ChevronLeft aria-hidden="true" /> Back to sign in
        </Link>
      </Button>

      <div>
        <Separator />
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Having trouble?{' '}
          <span className="font-semibold text-foreground">Contact Department Support</span>
        </p>
      </div>
    </StatusLayout>
  );
}

export default PasswordResetEmailSent;
