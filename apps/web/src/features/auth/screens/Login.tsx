import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Info, Mail } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import AuthLayout from '@/app/layouts/AuthLayout';
import Callout from '@/components/feedback/Callout';
import { PasswordField } from '@/components/forms/PasswordField';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ApiError, api, type LoginResponse } from '@/lib/api/http';
import { useAuthStore } from '@/stores/auth';

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your institutional email')
    .email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

type LoginForm = z.infer<typeof loginSchema>;

function fieldError(message: string | undefined) {
  return message ? (
    <p className="text-xs text-danger" role="fielderror">
      {message}
    </p>
  ) : null;
}

/**
 * Login + login-error are one screen (spec §3): a failed sign-in swaps the
 * info callout for the danger one and keeps the entered values.
 */
function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const session = await api.post<LoginResponse>('/auth/login', values);
      setSession(session.user, session.accessToken);

      // `next` only accepts site-relative paths (open-redirect guard).
      const next = params.get('next');
      const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
      navigate(target, { replace: true });
    } catch (error) {
      // Login failures never redirect (the interceptor excludes /auth/login):
      // 401 credentials, inactive account, and network errors all render here.
      setServerError(
        error instanceof ApiError
          ? error.message
          : 'Unable to reach ThesisTrack. Check your connection and try again.',
      );
    }
  });

  const pending = form.formState.isSubmitting;
  const { errors } = form.formState;

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Sign In</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter your institutional credentials to access your dashboard.
          </p>
        </CardHeader>

        <CardContent className="space-y-5">
          {serverError ? (
            <Callout variant="danger" title="Authentication failed">
              {serverError}
            </Callout>
          ) : (
            <Callout variant="info" title="Important note">
              Your account must be provisioned by your department before you can sign in.
            </Callout>
          )}

          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <div className="space-y-2">
              <Label
                htmlFor="login-email"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Email address
              </Label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  placeholder="e.g. j.doe@university.edu"
                  className="pl-9"
                  aria-invalid={!!errors.email}
                  {...form.register('email')}
                />
              </div>
              {fieldError(errors.email?.message)}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="login-password"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Password
                </Label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-semibold uppercase tracking-wider text-primary hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <PasswordField
                id="login-password"
                autoComplete="current-password"
                placeholder="Enter your password"
                aria-invalid={!!errors.password}
                {...form.register('password')}
              />
              {fieldError(errors.password?.message)}
            </div>

            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <div>
            <Separator />
            <p className="mt-4 text-center text-xs text-muted-foreground">
              New student or faculty member?{' '}
              <Link
                to="/invite"
                className="font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline"
              >
                Activate your invitation
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Info className="size-3.5 shrink-0" aria-hidden="true" />
        Authorized Academic Personnel Only
      </p>
    </AuthLayout>
  );
}

export default Login;
