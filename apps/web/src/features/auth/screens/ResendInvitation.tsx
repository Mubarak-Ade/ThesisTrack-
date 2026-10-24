import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Mail } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import AuthLayout from '@/app/layouts/AuthLayout';
import FormMessage from '@/components/forms/FormMessage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ApiError, api } from '@/lib/api/http';

const resendSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your institutional email')
    .email('Enter a valid email address'),
});

type ResendForm = z.infer<typeof resendSchema>;

/**
 * Self-service invitation resend — the forgot-password twin. An INVITED
 * account whose invitation email never arrived (dead relay, spam folder)
 * requests a fresh link, then hands the email to the "sent" screen. The
 * endpoint answers constant-200 either way, so the copy stays enumeration-safe.
 */
function ResendInvitation() {
  const navigate = useNavigate();

  const form = useForm<ResendForm>({
    resolver: zodResolver(resendSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await api.post('/auth/resend-invitation', values);
      // The sent screen re-uses this address for the resend action.
      navigate('/resend-invitation/sent', { state: { email: values.email } });
    } catch (error) {
      form.setError('root', {
        message:
          error instanceof ApiError
            ? error.message
            : 'Unable to reach ThesisTrack. Check your connection and try again.',
      });
    }
  });

  const pending = form.formState.isSubmitting;
  const { errors } = form.formState;

  return (
    <AuthLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-semibold text-foreground md:text-4xl">
            Didn&apos;t get your invitation?
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            Enter the email your department used for your ThesisTrack account and we&apos;ll send
            you a fresh invitation link.
          </p>
        </div>

        {errors.root && <FormMessage>{errors.root.message}</FormMessage>}

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label
              htmlFor="resend-email"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Institutional email address
            </Label>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="resend-email"
                type="email"
                autoComplete="email"
                placeholder="e.g. professor.name@university.edu"
                className="pl-9"
                aria-invalid={!!errors.email}
                {...form.register('email')}
              />
            </div>
            {errors.email && (
              <p className="text-xs text-danger" role="fielderror">
                {errors.email.message}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Sending…' : 'Send invitation link'}
          </Button>

          <Button variant="outline" className="w-full" disabled={pending} asChild>
            <Link to="/login">
              <ArrowLeft aria-hidden="true" /> Back to sign in
            </Link>
          </Button>
        </form>

        <div>
          <Separator />
          <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
            Still nothing after a few minutes?{' '}
            <span className="font-semibold text-primary">
              Contact your departmental IT administrator
            </span>{' '}
            — they can re-send your invitation directly.
          </p>
        </div>
      </div>
    </AuthLayout>
  );
}

export default ResendInvitation;
