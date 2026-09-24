import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import AuthLayout from '@/app/layouts/AuthLayout';
import Callout from '@/components/feedback/Callout';
import FormMessage from '@/components/forms/FormMessage';
import InvitationFlow from '../components/InvitationFlow';
import { PasswordField } from '@/components/forms/PasswordField';
import PasswordStrengthMeter from '@/components/forms/PasswordStrengthMeter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApiError, api } from '@/lib/api/http';

/**
 * Activate rule set = the meter's `activate` variant (min 10, upper, number,
 * special, match) — always satisfies the server's min-8 passwordSchema.
 */
const activateSchema = z
  .object({
    password: z
      .string()
      .min(10, 'At least 10 characters')
      .max(128, 'Maximum 128 characters')
      .regex(/[A-Z]/, 'One uppercase letter')
      .regex(/[0-9]/, 'One number')
      .regex(/[^A-Za-z0-9]/, 'One special character'),
    confirm: z.string().min(1, 'Confirm your password'),
  })
  .refine((values) => values.password === values.confirm, {
    message: 'Passwords must match',
    path: ['confirm'],
  });

type ActivateForm = z.infer<typeof activateSchema>;

/**
 * 4.8 — set credentials for the invited account. Left panel carries the
 * floating thumbs-up card from the mockup (hidden on small screens so it
 * never covers the headline). The flow gate redirects non-valid tokens.
 */
function InviteActivate() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<ActivateForm>({
    resolver: zodResolver(activateSchema),
    mode: 'onChange',
    defaultValues: { password: '', confirm: '' },
  });

  const password = form.watch('password');
  const confirm = form.watch('confirm');
  const pending = form.formState.isSubmitting;

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      await api.post('/auth/activate', { token, password: values.password });
      navigate('/invite/activate/success', { replace: true });
    } catch (error) {
      setServerError(
        error instanceof ApiError
          ? error.message
          : 'Unable to reach ThesisTrack. Check your connection and try again.',
      );
    }
  });

  return (
    <AuthLayout
      overlay={
        <div className="hidden md:block">
          <img
            src="/images/thumbs-up.jpg"
            alt="A hand giving a thumbs-up"
            className="w-44 -rotate-3 rounded-2xl shadow-2xl ring-8 ring-white lg:w-52"
          />
        </div>
      }
    >
      <InvitationFlow>
        {() => (
          <div className="space-y-6">
            <div className="space-y-3">
              <Badge
                variant="outline"
                className="gap-1.5 border-primary/30 bg-primary/10 px-3 py-1 text-primary"
              >
                <ShieldCheck className="size-3.5" aria-hidden="true" /> ACCOUNT SECURITY
              </Badge>
              <h1 className="font-display text-3xl font-semibold text-foreground md:text-4xl">
                Set your security credentials
              </h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Create a strong, unique password to protect your ThesisTrack account and research
                data.
              </p>
            </div>

            {serverError && <FormMessage>{serverError}</FormMessage>}

            <form onSubmit={onSubmit} noValidate className="space-y-4">
              <PasswordField
                label="Create password"
                autoComplete="new-password"
                placeholder="Enter a strong password"
                aria-invalid={!!form.formState.errors.password}
                {...form.register('password')}
              />
              <PasswordField
                label="Confirm password"
                autoComplete="new-password"
                placeholder="Repeat your password"
                aria-invalid={!!form.formState.errors.confirm}
                {...form.register('confirm')}
              />

              <PasswordStrengthMeter
                password={password}
                variant="activate"
                confirmation={confirm}
              />

              <Callout variant="info" title="Academic policy">
                By activating your account, you agree to comply with your institution&apos;s
                academic integrity and research data handling policies.
              </Callout>

              <Button
                type="submit"
                className="w-full"
                disabled={!form.formState.isValid || pending}
              >
                {pending ? (
                  'Activating…'
                ) : (
                  <>
                    Activate account <ArrowRight aria-hidden="true" />
                  </>
                )}
              </Button>
            </form>

            <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
              ISO 27001 certified · GDPR compliant
            </p>
          </div>
        )}
      </InvitationFlow>
    </AuthLayout>
  );
}

export default InviteActivate;
