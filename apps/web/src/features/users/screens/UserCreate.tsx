import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Mail, Rocket, ShieldCheck, UserRound, X } from 'lucide-react';
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
import { DEPARTMENTS, ROLES } from '../data/constants';
import type { CreateUserInput, Role } from '../data/types';
import { createUser } from '../data/usersRepo';

/** Mirrors the pinned create contract (§A): name/email/role, + optional §11.0.2 program. */
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
  // §11.0.2 delta — optional; blank = unaffiliated (ADR-16 default workflow).
  program: z.string().trim().max(255, 'Program must be 255 characters or fewer'),
  sendInvite: z.boolean(),
  enforcePasswordChange: z.boolean(),
});

type CreateForm = z.infer<typeof createSchema>;

const LABEL_CLASS =
  'text-xs font-semibold uppercase tracking-wider text-muted-foreground';

const SELECT_CLASS =
  'flex h-11 w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1';

/** Icon + bold title + uppercase kicker beneath + hairline rule (spec §5.3). */
function SectionHead({
  icon: Icon,
  title,
  kicker,
}: {
  icon: typeof UserRound;
  title: string;
  kicker: string;
}) {
  return (
    <>
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold text-foreground">{title}</h2>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {kicker}
          </p>
        </div>
      </div>
      <hr className="mt-4 border-border" />
    </>
  );
}

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
      program: '',
      // Both onboarding cards default-checked (spec §5.3).
      sendInvite: true,
      enforcePasswordChange: true,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const input: CreateUserInput = {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        role: values.role as Role,
        // UI-only — dropped again by the repo's toCreateBody (§A).
        department: values.department || undefined,
      };
      // §11.0.2: blank program stays off the wire (unaffiliated → default workflow).
      if (values.program) input.program = values.program;
      const created = await createUser(input);
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
      {/* Breadcrumb (spec §3): USER MANAGEMENT › ADD NEW USER */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <Link to="/users" className="transition-colors hover:text-primary">
          User Management
        </Link>
        <span aria-hidden="true">›</span>
        <span className="text-foreground">Add New User</span>
      </nav>

      <form onSubmit={onSubmit} noValidate>
        <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Link
              to="/users"
              aria-label="Back to All Users"
              className="grid size-10 shrink-0 place-items-center rounded-full border border-input bg-white text-foreground shadow-sm transition-colors hover:bg-accent"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Link>
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
                Create User Account
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
                Register new students, faculty, or staff into the ThesisTrack portal.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => navigate('/users')}>
              <X aria-hidden="true" />
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              Add User
            </Button>
          </div>
        </header>

        {errors.root && (
          <div className="mt-4">
            <FormMessage>{errors.root.message}</FormMessage>
          </div>
        )}

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {/* ── Form column ─────────────────────────────────────────── */}
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardContent className="p-5 sm:p-6">
                <SectionHead
                  icon={UserRound}
                  title="Identity & Contact"
                  kicker="Basic Organizational Information"
                />

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="uc-first" className={LABEL_CLASS}>
                      First Name
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
                      Last Name
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
                      Institutional Email
                    </Label>
                    {/* Envelope prefix (spec §5.3). */}
                    <div className="relative">
                      <Mail
                        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <Input
                        id="uc-email"
                        type="email"
                        autoComplete="email"
                        placeholder="e.g. m.holloway@student.edu"
                        aria-invalid={!!errors.email}
                        className="pl-9"
                        {...form.register('email')}
                      />
                    </div>
                    <p className="text-xs italic text-muted-foreground">
                      Verification email and portal invitation will be sent to this address.
                    </p>
                    {fieldError('email')}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 sm:p-6">
                <SectionHead
                  icon={ShieldCheck}
                  title="Role & Permissions"
                  kicker="System Access Configuration"
                />

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="uc-role" className={LABEL_CLASS}>
                      System Role
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
                      Academic Department
                    </Label>
                    <select id="uc-department" className={SELECT_CLASS} {...form.register('department')}>
                      <option value="">Not Selected</option>
                      {DEPARTMENTS.map((department) => (
                        <option key={department} value={department}>
                          {department}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="uc-program" className={LABEL_CLASS}>
                      Program
                    </Label>
                    <Input
                      id="uc-program"
                      placeholder="e.g. MSc Computer Science"
                      maxLength={255}
                      aria-invalid={!!errors.program}
                      {...form.register('program')}
                    />
                    <p className="text-xs italic text-muted-foreground">
                      Optional — departmental program used to pick the student&apos;s workflow
                      (ADR-16). Leave blank for unaffiliated: the default workflow applies.
                    </p>
                    {fieldError('program')}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 sm:p-6">
                <SectionHead
                  icon={Rocket}
                  title="Account Onboarding"
                  kicker="Automation Settings"
                />

                {/* Native checkbox cards, both default-checked (spec §4/§5.3). */}
                <div className="mt-4 space-y-3">
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background p-4 transition-colors hover:border-primary/40">
                    <input
                      type="checkbox"
                      checked={watched.sendInvite}
                      onChange={(event) => form.setValue('sendInvite', event.target.checked)}
                      className="mt-1 size-4 shrink-0 accent-primary"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">
                        Send Invitation Email Immediately
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                        User will receive a secure magic link to set their initial password and
                        access the dashboard.
                      </span>
                    </span>
                  </label>

                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background p-4 transition-colors hover:border-primary/40">
                    <input
                      type="checkbox"
                      checked={watched.enforcePasswordChange}
                      onChange={(event) =>
                        form.setValue('enforcePasswordChange', event.target.checked)
                      }
                      className="mt-1 size-4 shrink-0 accent-primary"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">
                        Enforce Immediate Password Change
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                        For security, users will be required to update their temporary credentials
                        upon their first successful login.
                      </span>
                    </span>
                  </label>
                </div>
              </CardContent>
            </Card>

            {/* Bottom note + actions (spec §5.3) — buttons share the handlers. */}
            <p className="text-xs italic text-muted-foreground">
              System logs will record this creation event under Coordinator profile for
              institutional audit purposes.
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => navigate('/users')}
              >
                Discard Changes
              </Button>
              <Button type="submit" disabled={pending} className="sm:min-w-44">
                Create User Profile
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
              }}
            />
          </div>
        </div>
      </form>
    </div>
  );
}
