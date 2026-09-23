import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Mail } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import AuthLayout from '@/components/AuthLayout';
import FormMessage from '@/components/FormMessage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ApiError, api } from '@/lib/http';

const forgotSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your institutional email')
    .email('Enter a valid email address'),
});

type ForgotForm = z.infer<typeof forgotSchema>;

/** 4.2 — request a reset link, then hand the email to the "sent" screen. */
function ForgotPassword() {
  const navigate = useNavigate();

  const form = useForm<ForgotForm>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await api.post('/auth/forgot-password', values);
      // The sent screen re-uses this address for the resend action.
      navigate('/forgot-password/sent', { state: { email: values.email } });
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
            Forgot your password?
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            Enter the email associated with your ThesisTrack account and we&apos;ll send you a
            password reset link.
          </p>
        </div>

        {errors.root && <FormMessage>{errors.root.message}</FormMessage>}

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label
              htmlFor="forgot-email"
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
                id="forgot-email"
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
            {pending ? 'Sending…' : 'Send reset link'}
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
            Can&apos;t access your institutional account?{' '}
            <span className="font-semibold text-primary">
              Contact your departmental IT administrator
            </span>{' '}
            for manual verification.
          </p>
        </div>
      </div>
    </AuthLayout>
  );
}

export default ForgotPassword;
