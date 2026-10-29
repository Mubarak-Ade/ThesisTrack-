import {
  AuthorizationError,
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  ValidationError,
  type ErrorDetail,
} from '../../errors/index.js';
import { db } from '../../config/db.js';
import { dispatchInvitationEmail } from '../../lib/mailer.js';
import { issueActivationToken, revokeAllSessions } from '../auth/service.js';
import {
  countOtherActiveAdministrators,
  findDepartmentRef,
  findExistingEmails,
  findExistingRegistrationNumbers,
  findUserByEmail as findUserByEmailRow,
  findUserById as findUserByIdRow,
  findUserByRegistrationNumber,
  insertUser,
  insertUsers,
  listActiveDepartmentIds,
  listDepartmentRefs,
  listUsers as listUsersRows,
  updateUser as updateUserRow,
  updateUserPassword as updateUserPasswordRow,
  type UserPatch,
} from './repository.js';
import {
  registrationNumberDeptSegment,
  STUDENT_REGISTRATION_HINT,
  STUDENT_REGISTRATION_PATTERN,
} from './registration.js';
import type { ImportUsersInput, ListUsersQuery, UpdateUserInput } from './schema.js';
import type {
  DepartmentRef,
  ImportResult,
  InvitedAccount,
  ProvisionInput,
  ProvisionedAccount,
  PublicUser,
  UserRow,
  UserStatus,
  UserWithDepartment,
} from './types.js';

/** Lifecycle state derived from the row (never stored — always truthful). */
function deriveStatus(row: UserRow): UserStatus {
  if (row.isActive) return 'ACTIVE';
  return row.passwordHash ? 'DEACTIVATED' : 'INVITED';
}

/** The only user shape that ever leaves the API — never exposes passwordHash. */
export function toPublicUser(row: UserWithDepartment): PublicUser {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    role: row.role as PublicUser['role'],
    isActive: row.isActive,
    registrationNumber: row.registrationNumber,
    department: row.department
      ? { id: row.department.id, name: row.department.name, code: row.department.code }
      : null,
    status: deriveStatus(row),
    createdAt: row.createdAt,
  };
}

/* ------------------------------------------------- registration numbers */

/**
 * The department must exist, and must be active unless it is the account's
 * own current department (design §5: an archived department stays editable so
 * its members are not locked out). A bad reference is a field-value failure
 * (400), not a business-rule violation.
 */
async function resolveDepartment(
  departmentId: string,
  ownDepartmentId: string | null = null,
): Promise<DepartmentRef> {
  const department = await findDepartmentRef(departmentId);
  if (!department) {
    throw new ValidationError('Invalid department', [
      { path: 'departmentId', message: 'Department not found' },
    ]);
  }
  if (departmentId !== ownDepartmentId) {
    const active = await listActiveDepartmentIds([departmentId]);
    if (!active.has(departmentId)) {
      throw new ValidationError('Invalid department', [
        { path: 'departmentId', message: 'Department is archived' },
      ]);
    }
  }
  return department;
}

/**
 * Students' `DEPT` segment must equal their department's code (design §4).
 * Skipped when the account is unaffiliated or the department is a legacy row
 * still missing its code — there is nothing to compare, and the admin banner
 * lists those departments. A mismatch is 422: the request is well-formed, the
 * domain rule is what fails.
 */
function assertDepartmentCodeMatches(
  registrationNumber: string,
  department: DepartmentRef | null,
): void {
  if (!department?.code) return;
  const segment = registrationNumberDeptSegment(registrationNumber);
  if (segment === null) return; // malformed legacy value — never re-validated

  const expected = department.code.toUpperCase();
  if (segment !== expected) {
    throw new BusinessRuleError('Registration number does not match the selected department', [
      {
        path: 'registrationNumber',
        message: `Department "${department.name}" uses code ${expected}; the number's DEPT segment is ${segment}`,
      },
    ]);
  }
}

/** 409 when another account already carries this number (case-insensitive). */
async function assertRegistrationNumberFree(
  registrationNumber: string,
  excludeUserId: string | null,
): Promise<void> {
  const clash = await findUserByRegistrationNumber(registrationNumber, excludeUserId);
  if (clash) {
    throw new ConflictError('This registration number is already in use');
  }
}

export function findUserByEmail(email: string): Promise<UserWithDepartment | undefined> {
  return findUserByEmailRow(email);
}

export function findUserById(userId: string): Promise<UserWithDepartment | undefined> {
  return findUserByIdRow(userId);
}

/**
 * Password write used by the auth module's activation and password-reset
 * flows. Exposed here so those flows never reach into this module's
 * `repository.ts` (ADR-02 — cross-module calls go through `service.ts`).
 */
export async function updateUserPassword(
  userId: string,
  passwordHash: string,
  options: { activate?: boolean } = {},
): Promise<UserWithDepartment | undefined> {
  const updated = await updateUserPasswordRow(userId, passwordHash, options);
  return updated ? findUserByIdRow(userId) : undefined;
}

/**
 * Account provisioning (there is no public self-registration):
 *
 *   admin creates user → INVITED → invitation token → user activates → ACTIVE
 *
 * An existing-but-inactive account is re-invited (fresh token); an active
 * account with the same email is a conflict.
 */
export async function provisionUser(input: ProvisionInput): Promise<ProvisionedAccount> {
  const existing = await findUserByEmailRow(input.email);

  if (existing?.isActive) {
    throw new ConflictError('An account with this email already exists');
  }

  let user: UserWithDepartment;
  let reinvited = false;

  if (existing) {
    // Re-invite: profile fields are not moved (recorded decision), so the
    // registration-number and department rules are not re-run either — the
    // existing row keeps its current, possibly grandfathered, values.
    reinvited = true;
    user = existing;
  } else {
    let department: DepartmentRef | null = null;
    if (input.departmentId) {
      department = await resolveDepartment(input.departmentId);
    }
    if (input.registrationNumber) {
      await assertRegistrationNumberFree(input.registrationNumber, null);
      if (input.role === 'student') {
        assertDepartmentCodeMatches(input.registrationNumber, department);
      }
    }

    const inserted = await insertUser({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email.toLowerCase(),
      role: input.role,
      registrationNumber: input.registrationNumber ?? null,
      departmentId: input.departmentId ?? null,
      passwordHash: null, // set during activation
      isActive: false, // INVITED
    });
    user = { ...inserted, department };
  }

  const { token, expiresAt } = await issueActivationToken(user.id);

  // Mailer design §7: send AFTER the insert commits, fire-and-forget (void) —
  // a slow/down relay never affects the HTTP response. On an idempotent replay
  // the controller never re-runs, so no second email.
  dispatchInvitationEmail(user, token, expiresAt);

  return { user, activationToken: token, activationExpiresAt: expiresAt, reinvited };
}

/** Single user lookup (admin detail view). */
export async function getUser(userId: string): Promise<UserWithDepartment> {
  const user = await findUserByIdRow(userId);
  if (!user) {
    throw new NotFoundError('User');
  }
  return user;
}

/** GET /users — search + filter + paginate, newest accounts first. */
export async function listUsers(
  query: ListUsersQuery,
): Promise<{ users: PublicUser[]; total: number }> {
  const { rows, total } = await listUsersRows({
    q: query.q,
    role: query.role,
    isActive: query.isActive,
    departmentId: query.departmentId,
    missingRegistrationNumber: query.missingRegistrationNumber,
    page: query.page,
    limit: query.limit,
  });
  return { users: rows.map(toPublicUser), total };
}

/**
 * PATCH /users/:userId — profile edits, role changes, activate/deactivate.
 *
 * Guards (in order):
 *   1. 404 unknown user
 *   2. an admin cannot deactivate themselves (lockout protection)
 *   3. the last active administrator cannot be deactivated or demoted
 *   4. an account that never activated cannot be flipped to ACTIVE
 *      directly — it has no password; resend the invitation instead
 *
 * Deactivation revokes every session, so access ends immediately (the same
 * rule password reset already follows).
 */
export async function updateUser(
  userId: string,
  input: UpdateUserInput,
  actorId: string,
): Promise<UserWithDepartment> {
  const target = await findUserByIdRow(userId);
  if (!target) {
    throw new NotFoundError('User');
  }

  const deactivating = input.isActive === false;
  const demoting =
    target.role === 'administrator' &&
    input.role !== undefined &&
    input.role !== 'administrator';

  if (deactivating && target.id === actorId) {
    throw new AuthorizationError('You cannot deactivate your own account');
  }

  if ((deactivating || demoting) && target.role === 'administrator' && target.isActive) {
    const others = await countOtherActiveAdministrators(target.id);
    if (others === 0) {
      throw new ConflictError('Cannot demote or deactivate the last active administrator');
    }
  }

  // A student can never be left without a registration number, and a number
  // supplied for a student must be well-formed. Enforce only when the patch
  // touches the student identity fields, so unrelated edits to grandfathered
  // legacy rows stay possible until an admin fixes them (design §4).
  const nextRole = input.role ?? target.role;
  const nextRegistration =
    input.registrationNumber !== undefined ? input.registrationNumber : target.registrationNumber;
  const touchesStudentIdentity =
    input.role !== undefined ||
    input.registrationNumber !== undefined ||
    input.departmentId !== undefined;

  if (nextRole === 'student' && touchesStudentIdentity) {
    if (!nextRegistration) {
      throw new BusinessRuleError('Registration number is required for students', [
        {
          path: 'registrationNumber',
          message: 'A student cannot be left without a registration number',
        },
      ]);
    }
    if (
      input.registrationNumber !== undefined &&
      !STUDENT_REGISTRATION_PATTERN.test(nextRegistration)
    ) {
      // Shape is static, so a malformed number is 400 — the same rule the
      // create schema applies (design §4). Legacy values are never re-checked
      // unless the admin actually resubmits one.
      throw new ValidationError('Invalid registration number', [
        { path: 'registrationNumber', message: STUDENT_REGISTRATION_HINT },
      ]);
    }
  }

  if (input.registrationNumber !== undefined && nextRegistration) {
    await assertRegistrationNumberFree(nextRegistration, target.id);
  }

  // Department: resolve only when the patch changes it. An archived reference
  // is acceptable only for the account's own current department.
  let nextDepartment: DepartmentRef | null = target.department;
  if (input.departmentId !== undefined) {
    nextDepartment = input.departmentId
      ? await resolveDepartment(input.departmentId, target.departmentId)
      : null;
  }

  // Re-run the cross-check whenever the number or the department changes.
  if (
    nextRole === 'student' &&
    nextRegistration &&
    (input.registrationNumber !== undefined || input.departmentId !== undefined)
  ) {
    assertDepartmentCodeMatches(nextRegistration, nextDepartment);
  }

  if (input.isActive === true && !target.passwordHash) {
    throw new BusinessRuleError(
      'This account has not been activated yet — resend the invitation instead',
    );
  }

  const fields: UserPatch = {};
  if (input.firstName !== undefined) fields.firstName = input.firstName;
  if (input.lastName !== undefined) fields.lastName = input.lastName;
  if (input.role !== undefined) fields.role = input.role;
  if (input.isActive !== undefined) fields.isActive = input.isActive;
  if (input.registrationNumber !== undefined) fields.registrationNumber = input.registrationNumber;
  if (input.departmentId !== undefined) fields.departmentId = input.departmentId;

  const updated = await updateUserRow(userId, fields);
  if (!updated) {
    throw new NotFoundError('User'); // deleted mid-flight
  }

  if (deactivating) {
    await revokeAllSessions(userId); // logged out of every device, now
  }

  return { ...updated, department: nextDepartment };
}

/**
 * POST /users/:userId/invite — resend the invitation to a not-yet-active
 * account. The fresh token supersedes any outstanding one (latest wins).
 * Active accounts are a conflict: they can simply sign in.
 */
export async function resendInvitation(userId: string): Promise<InvitedAccount> {
  const user = await findUserByIdRow(userId);
  if (!user) {
    throw new NotFoundError('User');
  }
  if (user.isActive) {
    throw new ConflictError('Account is already active');
  }

  const { token, expiresAt } = await issueActivationToken(user.id);

  // Mailer design §7: post-issue, fire-and-forget. The fresh token supersedes
  // any outstanding link, so at most one invitation link is ever valid.
  dispatchInvitationEmail(user, token, expiresAt);

  return { user, activationToken: token, activationExpiresAt: expiresAt };
}

/**
 * POST /users/import — bulk provisioning, all-or-nothing:
 *
 *   1. every row is validated (batch-internal duplicates and emails that
 *      already exist are row-level failures) → 422 with ALL row errors,
 *      nothing inserted
 *   2. users + their activation tokens are inserted in ONE transaction —
 *      a failure midway leaves no partial import behind
 *
 * Row *shape* errors are rejected earlier by the schema layer (400).
 */
export async function importUsers(input: ImportUsersInput): Promise<ImportResult> {
  const details: ErrorDetail[] = [];
  const seenEmails = new Set<string>();
  const seenNumbers = new Set<string>();

  input.users.forEach((user, index) => {
    if (seenEmails.has(user.email)) {
      details.push({ path: `users.${index}.email`, message: 'Duplicate email in this batch' });
    }
    seenEmails.add(user.email);

    if (user.registrationNumber) {
      if (seenNumbers.has(user.registrationNumber)) {
        details.push({
          path: `users.${index}.registrationNumber`,
          message: 'Duplicate registration number in this batch',
        });
      }
      seenNumbers.add(user.registrationNumber);
    }
  });

  const existingEmails = await findExistingEmails([...seenEmails]);
  input.users.forEach((user, index) => {
    if (existingEmails.has(user.email)) {
      details.push({
        path: `users.${index}.email`,
        message: 'An account with this email already exists',
      });
    }
  });

  if (seenNumbers.size > 0) {
    const taken = await findExistingRegistrationNumbers([...seenNumbers]);
    input.users.forEach((user, index) => {
      if (user.registrationNumber && taken.has(user.registrationNumber.toLowerCase())) {
        details.push({
          path: `users.${index}.registrationNumber`,
          message: 'This registration number is already in use',
        });
      }
    });
  }

  // Departments are resolved by id (the web layer maps the CSV's names), and
  // must be active — an archived department would strand the new account.
  const departmentIds = [
    ...new Set(input.users.flatMap((user) => (user.departmentId ? [user.departmentId] : []))),
  ];
  const [activeDepartmentIds, departmentRefs] = await Promise.all([
    listActiveDepartmentIds(departmentIds),
    listDepartmentRefs(departmentIds),
  ]);
  const refById = new Map(departmentRefs.map((ref) => [ref.id, ref]));

  input.users.forEach((user, index) => {
    if (!user.departmentId) return;
    const ref = refById.get(user.departmentId);
    if (!ref || !activeDepartmentIds.has(user.departmentId)) {
      details.push({
        path: `users.${index}.departmentId`,
        message: 'Department not found or archived',
      });
      return;
    }
    if (user.role === 'student' && user.registrationNumber) {
      const segment = registrationNumberDeptSegment(user.registrationNumber);
      if (ref.code && segment !== ref.code.toUpperCase()) {
        details.push({
          path: `users.${index}.registrationNumber`,
          message: `Department "${ref.name}" uses code ${ref.code}; the number's DEPT segment is ${segment}`,
        });
      }
    }
  });

  if (details.length > 0) {
    throw new BusinessRuleError('Import validation failed', details);
  }

  // Mailer design §7: send the N invitation emails strictly AFTER the batch
  // transaction COMMITS. SMTP is not transactional — a send inside the tx
  // would mail links to users a rollback then erases. A failed import mails
  // nobody; the awaited tx resolves only on commit.
  const result = await db.transaction(async (tx) => {
    const rows = await insertUsers(
      input.users.map((user) => ({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        registrationNumber: user.registrationNumber ?? null,
        departmentId: user.departmentId ?? null,
        passwordHash: null, // set during activation
        isActive: false, // INVITED
      })),
      tx,
    );

    const invitations: ImportResult['invitations'] = [];
    for (const row of rows) {
      const issued = await issueActivationToken(row.id, tx);
      invitations.push({
        email: row.email,
        activationToken: issued.token,
        activationExpiresAt: issued.expiresAt,
      });
    }

    // `rows` is index-aligned with the request (both built in the same order),
    // so the department resolved above attaches without a second read.
    const users = rows.map((row) => ({
      ...row,
      department: row.departmentId ? (refById.get(row.departmentId) ?? null) : null,
    }));

    return { users, invitations };
  });

  // Committed — dispatch fire-and-forget. `rows` and `invitations` are
  // index-aligned (both built in the same loop over `rows`), so zip them to
  // recover each recipient's name for the template.
  result.users.forEach((row, index) => {
    const invitation = result.invitations[index];
    if (invitation) {
      dispatchInvitationEmail(row, invitation.activationToken, invitation.activationExpiresAt);
    }
  });

  return result;
}
