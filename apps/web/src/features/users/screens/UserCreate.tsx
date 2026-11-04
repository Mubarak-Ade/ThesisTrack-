import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Mail, Rocket, ShieldCheck, UserRound, X } from 'lucide-react';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import FormMessage from '@/components/forms/FormMessage';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDepartments } from '@/features/departments/hooks/useDepartments';
import { ApiError } from '@/lib/api/http';
import { useAuthStore } from '@/stores/auth';
import AccountPreview from '../components/AccountPreview';
import { ROLE_LABELS, ROLES } from '../data/constants';
import type { CreateUserInput, Role } from '../data/types';
import { createUser } from '../data/usersRepo';

/** `FAC/YY/DEPT/NNNNN` — the shape the API stores (design 2026-10-28). */
const REGISTRATION_PATTERN = /^[A-Z]{2,4}\/\d{2}\/[A-Z]{2,4}\/\d{5}$/;

const SELECT_CLASS =
  'flex h-11 w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1';

/**
 * Mirrors the create contract. A student always needs a well-formed
 * registration number; when a department is chosen, its DEPT segment must be
 * that department's code (client-side mirror of the API's 422 rule).
 */
function buildSchema(departmentCodes: Map<string, string>) {
  return z
    .object({
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
      registrationNumber: z
        .string()
        .trim()
        .max(32, 'Registration number must be 32 characters or fewer'),
      departmentId: z.string(),
      sendInvite: z.boolean(),
      enforcePasswordChange: z.boolean(),
    })
    .superRefine((values, ctx) => {
      const number = values.registrationNumber.trim().toUpperCase();
      // Always required for students; supervisors may optionally have a staff
      // registration number, and administrators normally have none.
      if (values.role !== 'student') return;
      if (!number) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['registrationNumber'],
          message: 'Registration number is required for students',
        });
        return;
      }
      if (!REGISTRATION_PATTERN.test(number)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['registrationNumber'],
          message: 'Use FAC/YY/DEPT/NNNNN, e.g. CST/22/SWE/00825',
        });
        return;
      }
      const code = departmentCodes.get(values.departmentId);
      if (code && number.split('/')[2] !== code) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['registrationNumber'],
          message: `The DEPT segment must be ${code} for the selected department`,
        });
      }
    });
}

type CreateForm = z.infer<ReturnType<typeof buildSchema>>;

const LABEL_CLASS =
  'text-xs font-semibold uppercase tracking-wider text-muted-foreground';

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

/** Create User Account (spec §5.3) — live `POST /users` write. */
export default function UserCreate() {
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.user);
  // Design 2026-11-02: a coordinator provisions only students/supervisors in
  // its own department. The server enforces this; the form keeps it visible.
  const isCoordinator = session?.role === 'coordinator';
  const lockedDepartment = isCoordinator ? (session?.department ?? null) : null;
  const roleChoices = isCoordinator
    ? ROLES.filter((role) => role === 'student' || role === 'supervisor')
    : ROLES;

  const { data: departmentPage, isLoading: departmentsLoading } = useDepartments();
  const departments = useMemo(() => departmentPage?.items ?? [], [departmentPage]);
  const departmentCodes = useMemo(() => {
    const codes = new Map<string, string>();
    for (const department of departments) {
      if (department.code) codes.set(department.id, department.code);
    }
    if (lockedDepartment?.code) codes.set(lockedDepartment.id, lockedDepartment.code);
    return codes;
  }, [departments, lockedDepartment]);
  const schema = useMemo(() => buildSchema(departmentCodes), [departmentCodes]);

  const form = useForm<CreateForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      role: '',
      registrationNumber: '',
      departmentId: lockedDepartment?.id ?? '',
      // Both onboarding cards default-checked (spec §5.3).
      sendInvite: true,
      enforcePasswordChange: true,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    if (isCoordinator) {
      if (!lockedDepartment) {
        form.setError('root', {
          message: 'Your coordinator account has no department. Contact a super admin.',
        });
        return;
      }
      if (values.role !== 'student' && values.role !== 'supervisor') {
        form.setError('root', {
          message: 'Coordinators can only create students and supervisors.',
        });
        return;
      }
    }
    try {
      const input: CreateUserInput = {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        role: values.role as Role,
        registrationNumber: values.registrationNumber || undefined,
        departmentId: isCoordinator
          ? (lockedDepartment?.id ?? undefined)
          : values.departmentId || undefined,
      };
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

                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="uc-registration" className={LABEL_CLASS}>
                      Registration Number
                      {watched.role === 'student' ? (
                        <span className="text-danger"> *</span>
                      ) : (
                        <span className="normal-case tracking-normal text-muted-foreground"> (optional)</span>
                      )}
                    </Label>
                    <Input
                      id="uc-registration"
                      placeholder="e.g. CST/22/SWE/00825"
                      maxLength={32}
                      aria-invalid={!!errors.registrationNumber}
                      {...form.register('registrationNumber')}
                    />
                    <p className="text-xs italic text-muted-foreground">
                      {watched.role === 'student'
                        ? 'Required for students — FAC/YY/DEPT/NNNNN, where DEPT is the department code.'
                        : 'Optional for supervisors and administrators; any staff number is accepted.'}
                    </p>
                    {fieldError('registrationNumber')}
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
                      {roleChoices.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                    {isCoordinator && (
                      <p className="text-xs italic text-muted-foreground">
                        Coordinators can create students and supervisors only.
                      </p>
                    )}
                    {fieldError('role')}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="uc-department" className={LABEL_CLASS}>
                      Academic Department
                    </Label>
                    <select
                      id="uc-department"
                      className={SELECT_CLASS}
                      disabled={departmentsLoading || isCoordinator}
                      aria-invalid={!!errors.departmentId}
                      {...form.register('departmentId')}
                    >
                      {!isCoordinator && (
                        <option value="">
                          {departmentsLoading ? 'Loading departments…' : 'Unaffiliated (default workflow)'}
                        </option>
                      )}
                      {isCoordinator ? (
                        lockedDepartment ? (
                          <option value={lockedDepartment.id}>
                            {lockedDepartment.name}
                            {lockedDepartment.code ? ` (${lockedDepartment.code})` : ''}
                          </option>
                        ) : (
                          <option value="">No department assigned</option>
                        )
                      ) : (
                        departments.map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name}
                            {department.code ? ` (${department.code})` : ''}
                          </option>
                        ))
                      )}
                    </select>
                    <p className="text-xs italic text-muted-foreground">
                      {isCoordinator
                        ? 'Locked to your department (design 2026-11-02).'
                        : 'The managed list also picks the student’s workflow (ADR-16). Leave blank for unaffiliated: the default workflow applies.'}
                    </p>
                    {fieldError('departmentId')}
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
                registrationNumber: watched.registrationNumber ?? '',
                department:
                  departments.find((department) => department.id === watched.departmentId)?.name ?? '',
              }}
            />
          </div>
        </div>
      </form>
    </div>
  );
}
