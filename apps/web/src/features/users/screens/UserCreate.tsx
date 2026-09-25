import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import FormMessage from '@/components/forms/FormMessage';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api/http';
import AccountPreview from '../components/AccountPreview';
import Toggle from '../components/Toggle';
import { DEPARTMENTS, ROLES } from '../data/constants';
import type { Role } from '../data/types';
import { createUser } from '../data/usersRepo';

/** Mirrors the pinned create contract (§A): name/email/role only server-side. */
const createSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, 'First name is required')
    .max(255, 'First name must be 255 characters or fewer'),
  lastName: z
    .string()
    .trim()
    .min(1, 'Last name is required')
    .max(255, 'Last name must be 255 characters or fewer'),
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .email('Enter a valid email address')
    .max(255, 'Email must be 255 characters or fewer'),
  role: z.string().refine((value) => (ROLES as readonly string[]).includes(value), 'Select a role'),
  department: z.string(),
  sendInvite: z.boolean(),
  enforcePasswordChange: z.boolean(),
});

type CreateForm = z.infer<typeof createSchema>;

const ROLE_HELP: Record<Role, string> = {
  student: 'Students submit theses, upload drafts and track their own progress.',
  supervisor: 'Supervisors review assigned theses, leave feedback and approve milestones.',
  administrator: 'Administrators manage every account, setting and report in the console.',
};

const LABEL_CLASS =
  'text-xs font-semibold uppercase tracking-wider text-muted-foreground';

const SELECT_CLASS =
  'flex h-11 w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1';

/** Create User Account (spec §5.3) — live `POST /users` write, UI-only extras. */
export default function UserCreate() {
  const navigate = useNavigate();

  const form = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      role: '',
      department: '',
      sendInvite: true,
      enforcePasswordChange: false,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const created = await createUser({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        role: values.role as Role,
        // UI-only — dropped again by the repo's toCreateBody (§A).
        department: values.department || undefined,
      });
      // §A: create auto-provisions the invitation — the toggle only shapes
      // which confirmation the operator sees.
      if (values.sendInvite) {
        toast.success(`Invitation sent to ${created.user.email}`);
      } else {
        toast.success(`Account created (INVITED) for ${created.user.email}`);
      }
      navigate(`/users/${created.user.id}`);
    } catch (error) {
      form.setError('root', {
        message:
          error instanceof ApiError
            ? error.message
            : 'Unable to create the account. Check your connection and try again.',
      });
    }
  });

  const pending = form.formState.isSubmitting;
  const { errors } = form.formState;
  const watched = form.watch();

  const fieldError = (name: keyof CreateForm) =>
    errors[name] ? (
      <p className="text-xs text-danger" role="fielderror">
        {errors[name]?.message}
      </p>
    ) : null;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link to="/" className="transition-colors hover:text-primary">
          Home
        </Link>
        <span aria-hidden="true">/</span>
        <Link to="/users" className="transition-colors hover:text-primary">
          Users
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-foreground">New</span>
      </nav>

      <div className="mt-2">
        <p className="text-xs font-bold uppercase tracking-widest text-primary">User Management</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-foreground sm:text-3xl">
          Create User Account
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Provision a new directory account. The invited user sets their own password during
          activation.
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate className="mt-6">
        {errors.root && (
          <div className="mb-4">
            <FormMessage>{errors.root.message}</FormMessage>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          {/* ── Form column ─────────────────────────────────────────── */}
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardContent className="p-5 sm:p-6">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Profile
                </p>
                <h2 className="mt-1 font-display text-lg font-bold text-foreground">
                  Identity &amp; Contact
                </h2>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="uc-first" className={LABEL_CLASS}>
                      First name
                    </Label>
                    <Input
                      id="uc-first"
                      autoComplete="given-name"
                      placeholder="e.g. Marcus"
                      aria-invalid={!!errors.firstName}
                      {...form.register('firstName')}
                    />
                    {fieldError('firstName')}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="uc-last" className={LABEL_CLASS}>
                      Last name
                    </Label>
                    <Input
                      id="uc-last"
                      autoComplete="family-name"
                      placeholder="e.g. Holloway"
                      aria-invalid={!!errors.lastName}
                      {...form.register('lastName')}
                    />
                    {fieldError('lastName')}
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="uc-email" className={LABEL_CLASS}>
                      Institutional email address
                    </Label>
                    <Input
                      id="uc-email"
                      type="email"
                      autoComplete="email"
                      placeholder="e.g. m.holloway@student.edu"
                      aria-invalid={!!errors.email}
                      {...form.register('email')}
                    />
                    {fieldError('email')}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 sm:p-6">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Access
                </p>
                <h2 className="mt-1 font-display text-lg font-bold text-foreground">
                  Role &amp; Permissions
                </h2>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="uc-role" className={LABEL_CLASS}>
                      Role
                    </Label>
                    <select
                      id="uc-role"
                      className={SELECT_CLASS}
                      aria-invalid={!!errors.role}
                      {...form.register('role')}
                    >
                      <option value="">Select a role…</option>
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role.charAt(0).toUpperCase() + role.slice(1)}
                        </option>
                      ))}
                    </select>
                    {fieldError('role')}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="uc-department" className={LABEL_CLASS}>
                      Department
                    </Label>
                    <select id="uc-department" className={SELECT_CLASS} {...form.register('department')}>
                      <option value="">Not assigned yet (TBD)</option>
                      {DEPARTMENTS.map((department) => (
                        <option key={department} value={department}>
                          {department}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      No departments endpoint — list is a local constant (spec §4).
                    </p>
                  </div>
                </div>

                {watched.role && (
                  <p className="mt-3 rounded-lg bg-surface-alt px-3 py-2.5 text-sm text-muted-foreground">
                    {ROLE_HELP[watched.role as Role]}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 sm:p-6">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Setup
                </p>
                <h2 className="mt-1 font-display text-lg font-bold text-foreground">
                  Account Onboarding
                </h2>

                <div className="mt-4 space-y-4">
                  <Toggle
                    checked={watched.sendInvite}
                    onChange={(checked) => form.setValue('sendInvite', checked)}
                    label="Send Invitation Email Immediately"
                    description="Mention the issued invitation in the success confirmation after creation."
                  />
                  <Toggle
                    checked={watched.enforcePasswordChange}
                    onChange={(checked) => form.setValue('enforcePasswordChange', checked)}
                    label="Enforce Immediate Password Change"
                    description="The API has no such flag yet — kept for console parity."
                    uiOnly
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button type="submit" disabled={pending} className="sm:min-w-44">
                {pending ? 'Creating…' : 'Create Account'}
              </Button>
              <Button type="button" variant="outline" disabled={pending} onClick={() => navigate('/users')}>
                <ArrowLeft aria-hidden="true" />
                Cancel
              </Button>
            </div>
          </div>

          {/* ── Preview rail ───────────────────────────────────────── */}
          <div className="lg:sticky lg:top-20 lg:self-start">
            <AccountPreview
              values={{
                firstName: watched.firstName ?? '',
                lastName: watched.lastName ?? '',
                email: watched.email ?? '',
                role: watched.role ?? '',
                department: watched.department ?? '',
                sendInvite: watched.sendInvite ?? true,
              }}
            />
          </div>
        </div>
      </form>
    </div>
  );
}
