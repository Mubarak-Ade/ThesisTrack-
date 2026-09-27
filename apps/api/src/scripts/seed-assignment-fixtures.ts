import { writeFileSync } from 'node:fs';
import { eq, isNull, and } from 'drizzle-orm';
import { db } from '../config/db.js';
import { users, projects, supervisorAssignments } from '../schema/index.js';
import { hashPassword } from '../modules/auth/service.js';

/**
 * Deterministic fixtures for the Phase 7 assignment suite:
 *
 *   P1  ownerA + ACTIVE super1 + ENDED super2 (history, assignedBy=admin)
 *   P2  ownerB + bare (write tests need a project without an assignment)
 *   P3  ownerC + COMPLETED + bare (status-rule tests)
 *
 * Idempotent: re-running repairs state (ends stray actives, restores the
 * active super1 row) instead of failing the partial unique index.
 *
 *   npx tsx src/scripts/seed-assignment-fixtures.ts              → prints JSON
 *   FIXTURES_OUT=file …                                           → also writes JSON
 */
const PASSWORD = process.env.ASSIGN_FIXTURE_PASSWORD ?? 'RbacFixtures123!';
const suffix = process.env.ASSIGN_SUFFIX ?? '';
const DAY = 86_400_000;

const ACCOUNTS = [
  { key: 'ownerA', email: `asg-owner-a${suffix}@test.local`, role: 'student' as const, firstName: 'Olive', lastName: 'OwnerA' },
  { key: 'ownerB', email: `asg-owner-b${suffix}@test.local`, role: 'student' as const, firstName: 'Otto', lastName: 'OwnerB' },
  { key: 'ownerC', email: `asg-owner-c${suffix}@test.local`, role: 'student' as const, firstName: 'Oscar', lastName: 'OwnerC' },
  { key: 'super1', email: `asg-super-1${suffix}@test.local`, role: 'supervisor' as const, firstName: 'Sam', lastName: 'First' },
  { key: 'super2', email: `asg-super-2${suffix}@test.local`, role: 'supervisor' as const, firstName: 'Sara', lastName: 'Second' },
  { key: 'super3', email: `asg-super-3${suffix}@test.local`, role: 'supervisor' as const, firstName: 'Sean', lastName: 'Third' },
];

const PROJECTS = [
  { key: 'projectId', owner: 'ownerA', title: 'Assignment Fixture P1', status: 'active' as const },
  { key: 'bareProjectId', owner: 'ownerB', title: 'Assignment Fixture P2 (bare)', status: 'active' as const },
  { key: 'completedProjectId', owner: 'ownerC', title: 'Assignment Fixture P3 (completed)', status: 'completed' as const },
];

async function upsertUser(a: (typeof ACCOUNTS)[number], passwordHash: string): Promise<string> {
  const existing = await db.query.users.findFirst({ where: eq(users.email, a.email) });
  if (existing) {
    await db
      .update(users)
      .set({ role: a.role, passwordHash, isActive: true, firstName: a.firstName, lastName: a.lastName })
      .where(eq(users.id, existing.id));
    return existing.id;
  }
  const [created] = await db
    .insert(users)
    .values({ email: a.email, role: a.role, firstName: a.firstName, lastName: a.lastName, passwordHash, isActive: true })
    .returning({ id: users.id });
  return created.id;
}

async function upsertProject(p: (typeof PROJECTS)[number], ownerId: string): Promise<string> {
  const existing = await db.query.projects.findFirst({ where: eq(projects.studentId, ownerId) });
  if (existing) {
    await db
      .update(projects)
      .set({ title: p.title, status: p.status, updatedAt: new Date() })
      .where(eq(projects.id, existing.id));
    return existing.id;
  }
  const [created] = await db
    .insert(projects)
    .values({ studentId: ownerId, title: p.title, description: 'Fixture for assignment tests.', status: p.status })
    .returning({ id: projects.id });
  return created.id;
}

/** End every still-active row on the project (never deletes — history stays). */
async function endAllActive(projectId: string): Promise<void> {
  await db
    .update(supervisorAssignments)
    .set({ endedAt: new Date() })
    .where(and(eq(supervisorAssignments.projectId, projectId), isNull(supervisorAssignments.endedAt)));
}

/** Ensure an ENDED history row exists for the pair. */
async function ensureEndedRow(projectId: string, supervisorId: string, adminId: string): Promise<void> {
  const existing = await db.query.supervisorAssignments.findFirst({
    where: and(
      eq(supervisorAssignments.projectId, projectId),
      eq(supervisorAssignments.supervisorId, supervisorId),
    ),
  });
  if (existing) {
    if (existing.endedAt === null) {
      await db
        .update(supervisorAssignments)
        .set({ endedAt: new Date(Date.now() - 10 * DAY) })
        .where(eq(supervisorAssignments.id, existing.id));
    }
    return;
  }
  await db.insert(supervisorAssignments).values({
    projectId,
    supervisorId,
    isPrimary: false,
    assignedAt: new Date(Date.now() - 20 * DAY),
    endedAt: new Date(Date.now() - 10 * DAY),
    assignedBy: adminId,
  });
}

/** Make exactly one ACTIVE super row for the project (creating it if needed). */
async function ensureActiveRow(projectId: string, supervisorId: string, adminId: string): Promise<void> {
  const rows = await db.query.supervisorAssignments.findMany({
    where: and(
      eq(supervisorAssignments.projectId, projectId),
      eq(supervisorAssignments.supervisorId, supervisorId),
    ),
    orderBy: (t, { desc }) => [desc(t.assignedAt)],
  });

  if (rows.length === 0) {
    await db.insert(supervisorAssignments).values({
      projectId,
      supervisorId,
      isPrimary: true,
      assignedAt: new Date(Date.now() - 5 * DAY),
      endedAt: null,
      assignedBy: adminId,
    });
    return;
  }

  // Reactivate the newest row for this pair; every other row stays history.
  const [newest, ...rest] = rows;
  await db
    .update(supervisorAssignments)
    .set({ endedAt: null, isPrimary: true, assignedBy: adminId })
    .where(eq(supervisorAssignments.id, newest.id));
  for (const row of rest) {
    if (row.endedAt === null) {
      await db
        .update(supervisorAssignments)
        .set({ endedAt: new Date() })
        .where(eq(supervisorAssignments.id, row.id));
    }
  }
}

async function main(): Promise<void> {
  const passwordHash = await hashPassword(PASSWORD);

  const adminEmail = (process.env.ADMIN_EMAIL ?? 'admin@thesistrack.local').trim().toLowerCase();
  const admin = await db.query.users.findFirst({ where: eq(users.email, adminEmail) });
  if (!admin) {
    throw new Error(`Seed admin ${adminEmail} missing — run: pnpm seed:admin`);
  }

  const ids: Record<string, string> = {};
  for (const a of ACCOUNTS) {
    ids[a.key] = await upsertUser(a, passwordHash);
  }

  for (const p of PROJECTS) {
    ids[p.key] = await upsertProject(p, ids[p.owner]);
  }

  // P1: history first (ended super2), then the single active super1 row.
  await endAllActive(ids.projectId);
  await ensureEndedRow(ids.projectId, ids.super2, admin.id);
  await ensureActiveRow(ids.projectId, ids.super1, admin.id);

  // P2 and P3 must be bare (write tests assign them from scratch).
  await endAllActive(ids.bareProjectId);
  await endAllActive(ids.completedProjectId);

  const summary = {
    password: PASSWORD,
    admin: adminEmail,
    adminId: admin.id,
    projectId: ids.projectId,
    bareProjectId: ids.bareProjectId,
    completedProjectId: ids.completedProjectId,
    ownerA: ACCOUNTS[0].email,
    ownerB: ACCOUNTS[1].email,
    ownerC: ACCOUNTS[2].email,
    super1: ACCOUNTS[3].email,
    super2: ACCOUNTS[4].email,
    super3: ACCOUNTS[5].email,
    // UUIDs for request bodies and .id assertions (emails are for logins only).
    ownerAId: ids.ownerA,
    ownerBId: ids.ownerB,
    ownerCId: ids.ownerC,
    super1Id: ids.super1,
    super2Id: ids.super2,
    super3Id: ids.super3,
  };

  if (process.env.FIXTURES_OUT) {
    writeFileSync(process.env.FIXTURES_OUT, JSON.stringify(summary, null, 2));
  }
  console.log(JSON.stringify(summary));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
