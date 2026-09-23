import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, CheckCircle2, XCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import AuthLayout from '@/components/AuthLayout';
import Callout from '@/components/Callout';
import FormMessage from '@/components/FormMessage';
import { PasswordField } from '@/components/PasswordField';
import PasswordStrengthMeter from '@/components/PasswordStrengthMeter';
import { Button } from '@/components/ui/button';
import { ApiError, api } from '@/lib/http';

/**
 * Mirrors the `reset` rule set shown by the meter, and stays inside the
 * server's passwordSchema (min 8 / max 128).
 */
const resetSchema = z
  .object({
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .max(128, 'Maximum 128 characters')
      .regex(/[A-Z]/, 'One uppercase letter')
      .regex(/[a-z]/, 'One lowercase letter')
      .regex(/[0-9]/, 'One number'),
    confirm: z.string().min(1, 'Confirm your new password'),
  })
  .refine((values) => values.password === values.confirm, {
    message: 'Passwords must match',
    path: ['confirm'],
  });

type ResetForm = z.infer<typeof resetSchema>;

/** 4.4 — /reset-password?token=… sets the new password. */
function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
    mode: 'onChange',
    defaultValues: { password: '', confirm: '' },
  });

  const password = form.watch('password');
  const confirm = form.watch('confirm');
  const matches = confirm.length > 0 && password === confirm;

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      await api.post('/auth/reset-password', { token, password: values.password });
      navigate('/reset-password/success', { replace: true });
    } catch (error) {
      setServerError(
        error instanceof ApiError
          ? error.message
          : 'Unable to reach ThesisTrack. Check your connection and try again.',
      );
    }
  });

  if (!token) {
    return <Navigate to="/forgot-password" replace />;
  }

  const pending = form.formState.isSubmitting;
  const canSubmit = form.formState.isValid;
  const passwordError = form.formState.errors.password;

  return (
    <AuthLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-semibold text-foreground md:text-4xl">
            Create a new password
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            Choose a new password for your account. It must satisfy the security policy below.
          </p>
        </div>

        {serverError && (
          <FormMessage>
            {serverError} This reset link may be invalid or expired —{' '}
            <Link to="/forgot-password" className="font-medium underline">
              request a new one
            </Link>
            .
          </FormMessage>
        )}

        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <div className="space-y-2">
            <PasswordField
              label="New password"
              autoComplete="new-password"
              placeholder="Enter a new password"
              aria-invalid={!!passwordError}
              {...form.register('password')}
            />
            {passwordError && (
              <p className="text-xs text-danger" role="fielderror">
                {passwordError.message}
              </p>
            )}
          </div>

          <PasswordStrengthMeter password={password} variant="reset" />

          <div className="space-y-2">
            <PasswordField
              label="Confirm new password"
              autoComplete="new-password"
              placeholder="Re-enter the new password"
              aria-invalid={!!form.formState.errors.confirm}
              {...form.register('confirm')}
            />
            <p
              className={
                matches
                  ? 'flex items-center gap-2 text-sm text-foreground'
                  : 'flex items-center gap-2 text-sm text-muted-foreground'
              }
              role="status"
            >
              {matches ? (
                <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
              ) : (
                <XCircle className="size-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
              )}
              {matches ? 'Passwords match' : 'Passwords must match'}
            </p>
          </div>

          <Callout variant="neutral">
            Avoid common words or personal information — like your student ID or birth date —
            when choosing your password.
          </Callout>

          <Button type="submit" className="w-full" disabled={!canSubmit || pending}>
            {pending ? 'Updating…' : 'Reset password'} <ArrowRight aria-hidden="true" />
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          <Link
            to="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}

export default ResetPassword;
