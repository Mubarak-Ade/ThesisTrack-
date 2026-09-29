import { randomUUID } from 'node:crypto';
import { inArray, eq } from 'drizzle-orm';
import { Request, Response, RequestHandler } from 'express';
import { db } from '../config/db.js';
import { users, projects } from '../schema/index.js';
import {
  requireAuth,
  requireRole,
  requireAdmin,
  requireProjectOwner,
  requireSupervisorAssignment,
  requireProjectAccess,
  requireWorkflow,
  getWorkflowContext,
  getProject,
  anyOf,
} from '../authz/index.js';
import type { AuthUser } from '../middleware/auth.js';
import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  BusinessRuleError,
  NotFoundError,
} from '../errors/index.js';

/**
 * Unit self-test for the authorization layer — exercises every guard's exact
 * semantics (including strict cases no HTTP route exposes) against real DB
 * rows, using fabricated requests. Run:  pnpm authz:selftest
 */

let pass = 0;
let fail = 0;
const failures: string[] = [];

function ck(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    failures.push(name);
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

function makeReq(user: AuthUser | undefined, params: Record<string, string>): Request {
  return { user, params, headers: {}, body: {} } as unknown as Request;
}

const fakeRes = {} as Response;

/** Runs a guard and resolves with whatever it passed to next(). */
function invoke(handler: RequestHandler, req: Request): Promise<{ called: boolean; err: unknown }> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (result: { called: boolean; err: unknown }) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve(result);
      }
    };
    const timer = setTimeout(() => finish({ called: false, err: new Error('guard never called next()') }), 2000);

    try {
      const ret = handler(req, fakeRes, (err?: unknown) => finish({ called: true, err }));
      if (ret instanceof Promise) {
        ret.catch((e) => finish({ called: true, err: e ?? new Error('guard rejected') }));
      }
    } catch (e) {
      finish({ called: true, err: e });
    }
  });
}

async function expectPass(name: string, handler: RequestHandler, req: Request): Promise<void> {
  const r = await invoke(handler, req);
  ck(name, r.called && r.err === undefined, `(err=${describe(r.err)})`);
}

async function expectErr(
  name: string,
  handler: RequestHandler,
  req: Request,
  ctor: new (...args: never[]) => AppError,
  statusCode?: number,
): Promise<void> {
  const r = await invoke(handler, req);
  const err = r.err;
  const rightType = err instanceof ctor;
  const rightStatus = statusCode === undefined || (err instanceof AppError && err.statusCode === statusCode);
  ck(name, rightType && rightStatus, `(err=${describe(err)}, expected ${ctor.name}${statusCode ? ` ${statusCode}` : ''})`);
}

function describe(err: unknown): string {
  if (err === undefined) return 'none';
  if (err instanceof AppError) return `${err.name}[${err.statusCode} ${err.code}]: ${err.message}`;
  return String(err);
}

async function main(): Promise<void> {
  // ── Fixtures (own rows, cleaned up afterwards) ─────────────────────────
  const stamp = Date.now();
  const passwordHash = 'x'; // guards never look at passwords

  const [ownerRow] = await db
    .insert(users)
    .values({ email: `authz-owner-${stamp}@test.local`, firstName: 'A', lastName: 'Owner', role: 'student', passwordHash, isActive: true })
    .returning({ id: users.id });
  const [supRow] = await db
    .insert(users)
    .values({ email: `authz-sup-${stamp}@test.local`, firstName: 'B', lastName: 'Sup', role: 'supervisor', passwordHash, isActive: true })
    .returning({ id: users.id });
  const [supEndedRow] = await db
    .insert(users)
    .values({ email: `authz-sup-ended-${stamp}@test.local`, firstName: 'C', lastName: 'SupE', role: 'supervisor', passwordHash, isActive: true })
    .returning({ id: users.id });

  const [projectRow] = await db
    .insert(projects)
    .values({ studentId: ownerRow.id, title: 'Authz selftest project', description: 'Authorization self-test.' })
    .returning({ id: projects.id });

  const { supervisorAssignments } = await import('../schema/index.js');
  // Both rows belong to ownerRow's student (spec §8.2). Only supRow is ACTIVE;
  // supEndedRow is history, so the two never collide on
  // idx_supervisor_assignments_active_student (I13).
  await db.insert(supervisorAssignments).values({
    studentId: ownerRow.id,
    projectId: projectRow.id,
    supervisorId: supRow.id,
    isPrimary: true,
  });
  await db.insert(supervisorAssignments).values({
    studentId: ownerRow.id,
    projectId: projectRow.id,
    supervisorId: supEndedRow.id,
    endedAt: new Date(),
  });

  const owner: AuthUser = { id: ownerRow.id, email: 'owner@test.local', role: 'student' };
  const other: AuthUser = { id: randomUUID(), email: 'other@test.local', role: 'student' };
  const sup: AuthUser = { id: supRow.id, email: 'sup@test.local', role: 'supervisor' };
  const supEnded: AuthUser = { id: supEndedRow.id, email: 'sup-ended@test.local', role: 'supervisor' };
  const outsider: AuthUser = { id: randomUUID(), email: 'outsider@test.local', role: 'supervisor' };
  const admin: AuthUser = { id: randomUUID(), email: 'admin@test.local', role: 'administrator' };

  const P = { projectId: projectRow.id };
  const MISSING = { projectId: randomUUID() };
  const MALFORMED = { projectId: 'not-a-uuid' };

  try {
    console.log('== requireAuth ==');
    await expectErr('no user → 401', requireAuth, makeReq(undefined, {}), AuthenticationError, 401);
    await expectPass('user → pass', requireAuth, makeReq(other, {}));

    console.log('== requireRole (RBAC) ==');
    await expectPass('student matches', requireRole('student'), makeReq(other, {}));
    await expectPass('supervisor in allow-list', requireRole('supervisor', 'administrator'), makeReq(sup, {}));
    await expectErr('student not in allow-list → 403', requireRole('supervisor'), makeReq(other, {}), AuthorizationError, 403);
    await expectErr('no user → 401', requireRole('student'), makeReq(undefined, {}), AuthenticationError, 401);
    await expectPass('no roles = any authenticated', requireRole(), makeReq(admin, {}));

    console.log('== requireAdmin ==');
    await expectPass('administrator passes', requireAdmin(), makeReq(admin, {}));
    await expectErr('supervisor → 403', requireAdmin(), makeReq(sup, {}), AuthorizationError, 403);
    await expectErr('student → 403', requireAdmin(), makeReq(other, {}), AuthorizationError, 403);

    console.log('== requireProjectOwner (own project only) ==');
    await expectPass('owner passes', requireProjectOwner(), makeReq(owner, P));
    {
      const req = makeReq(owner, P);
      await invoke(requireProjectOwner(), req);
      ck('owner: req.project set for handler', req.project?.id === projectRow.id);
    }
    await expectErr('other student → 403', requireProjectOwner(), makeReq(other, P), AuthorizationError, 403);
    await expectErr('assigned supervisor → 403 (strict)', requireProjectOwner(), makeReq(sup, P), AuthorizationError, 403);
    await expectErr('admin → 403 (strict; compose with anyOf for override)', requireProjectOwner(), makeReq(admin, P), AuthorizationError, 403);
    await expectErr('missing project → 404', requireProjectOwner(), makeReq(owner, MISSING), NotFoundError, 404);
    await expectErr('malformed id → 404 (never hits pg)', requireProjectOwner(), makeReq(owner, MALFORMED), NotFoundError, 404);
    await expectErr('no user → 401', requireProjectOwner(), makeReq(undefined, P), AuthenticationError, 401);

    console.log('== requireSupervisorAssignment (assigned projects only) ==');
    await expectPass('assigned supervisor passes', requireSupervisorAssignment(), makeReq(sup, P));
    await expectErr('outsider supervisor → 403', requireSupervisorAssignment(), makeReq(outsider, P), AuthorizationError, 403);
    await expectErr('ENDED assignment → 403', requireSupervisorAssignment(), makeReq(supEnded, P), AuthorizationError, 403);
    await expectErr('owner student → 403 (strict)', requireSupervisorAssignment(), makeReq(owner, P), AuthorizationError, 403);
    await expectErr('missing project → 404', requireSupervisorAssignment(), makeReq(sup, MISSING), NotFoundError, 404);

    console.log('== requireProjectAccess (composite: owner | supervisor | admin) ==');
    await expectPass('owner passes', requireProjectAccess(), makeReq(owner, P));
    await expectPass('assigned supervisor passes', requireProjectAccess(), makeReq(sup, P));
    await expectPass('admin passes', requireProjectAccess(), makeReq(admin, P));
    await expectErr('other student → 403', requireProjectAccess(), makeReq(other, P), AuthorizationError, 403);
    await expectErr('outsider supervisor → 403', requireProjectAccess(), makeReq(outsider, P), AuthorizationError, 403);
    await expectErr('ended assignment → 403', requireProjectAccess(), makeReq(supEnded, P), AuthorizationError, 403);
    await expectErr('missing project → 404', requireProjectAccess(), makeReq(admin, MISSING), NotFoundError, 404);

    console.log('== anyOf (composition) ==');
    await expectPass('anyOf(owner, admin): owner passes', anyOf(requireProjectOwner(), requireAdmin()), makeReq(owner, P));
    await expectPass('anyOf(owner, admin): admin passes', anyOf(requireProjectOwner(), requireAdmin()), makeReq(admin, P));
    await expectErr('anyOf(owner, admin): student → 403', anyOf(requireProjectOwner(), requireAdmin()), makeReq(other, P), AuthorizationError, 403);
    await expectErr('anyOf: 404 short-circuits, never masked by 403', anyOf(requireProjectOwner(), requireAdmin()), makeReq(owner, MISSING), NotFoundError, 404);

    console.log('== requireWorkflow (workflow authorization) ==');
    type S = 'draft' | 'submitted' | 'approved';
    type A = 'submit' | 'approve';
    const wf = (
      resource: { status: S } | undefined,
      action: A,
    ): RequestHandler =>
      requireWorkflow<S, A>({
        resource: 'Thing',
        load: async () => resource,
        action,
        transitions: { submit: ['draft'], approve: ['submitted'] },
        roles: { submit: ['student'], approve: ['supervisor', 'administrator'] },
      });

    await expectPass('student submits draft → pass', wf({ status: 'draft' }, 'submit'), makeReq(owner, {}));
    {
      const req = makeReq(owner, {});
      await invoke(wf({ status: 'draft' }, 'submit'), req);
      const ctx = getWorkflowContext<{ status: S }>(req);
      ck('workflow context exposed to handler', ctx?.action === 'submit' && ctx.resource.status === 'draft');
    }
    await expectErr('role check first: student approves → 403', wf({ status: 'submitted' }, 'approve'), makeReq(owner, {}), AuthorizationError, 403);
    await expectPass('supervisor approves submitted → pass', wf({ status: 'submitted' }, 'approve'), makeReq(sup, {}));
    await expectErr('submit already-submitted → 422 business rule', wf({ status: 'submitted' }, 'submit'), makeReq(owner, {}), BusinessRuleError, 422);
    await expectErr('approve already-approved → 422 business rule', wf({ status: 'approved' }, 'approve'), makeReq(sup, {}), BusinessRuleError, 422);
    await expectErr('missing resource → 404', wf(undefined, 'submit'), makeReq(owner, {}), NotFoundError, 404);

    console.log('== getProject ==');
    {
      const bare = makeReq(owner, P);
      try {
        getProject(bare);
        ck('getProject without guard → 404', false);
      } catch (e) {
        ck('getProject without guard → 404', e instanceof NotFoundError);
      }
    }
  } finally {
    // ── Cleanup ──────────────────────────────────────────────────────────
    await db.delete(projects).where(eq(projects.id, projectRow.id)); // cascades assignments
    await db
      .delete(users)
      .where(inArray(users.id, [ownerRow.id, supRow.id, supEndedRow.id]));
  }

  console.log('===================================');
  console.log(`  PASS: ${pass}   FAIL: ${fail}`);
  if (fail > 0) console.log(`  Failed: ${failures.join(' | ')}`);
  console.log('===================================');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
