import { writeFileSync } from 'node:fs';
import { eq, and } from 'drizzle-orm';
import { db } from '../config/db.js';
import { users, projects, supervisorAssignments } from '../schema/index.js';
import { hashPassword } from '../services/password.js';

/**
 * Deterministic fixtures for the RBAC test matrix:
 *
 *   owner student · other student (no project) · assigned supervisor ·
 *   outsider supervisor · supervisor with an ENDED assignment · one project
 *
 * Idempotent: re-running resets passwords and reuses existing rows.
 *
 *   pnpm seed:rbac            → prints a JSON summary
 *   FIXTURES_OUT=file pnpm seed:rbac → also writes the JSON to a file
 */
const PASSWORD = process.env.RBAC_FIXTURE_PASSWORD ?? 'RbacFixtures123!';
const suffix = process.env.RBAC_SUFFIX ?? '';

const ACCOUNTS = [
  { key: 'owner', email: `rbac-owner${suffix}@test.local`, role: 'student' as const, firstName: 'Ruby', lastName: 'Owner' },
  { key: 'other', email: `rbac-other${suffix}@test.local`, role: 'student' as const, firstName: 'Otto', lastName: 'Other' },
  { key: 'superAssigned', email: `rbac-super-assigned${suffix}@test.local`, role: 'supervisor' as const, firstName: 'Sam', lastName: 'Super' },
  { key: 'superOutsider', email: `rbac-super-outsider${suffix}@test.local`, role: 'supervisor' as const, firstName: 'Olive', lastName: 'Outsider' },
  { key: 'superEnded', email: `rbac-super-ended${suffix}@test.local`, role: 'supervisor' as const, firstName: 'Ed', lastName: 'Ended' },
];

const PROJECT_TITLE = 'RBAC Fixture Project';

async function upsertUser(a: (typeof ACCOUNTS)[number]): Promise<string> {
  const passwordHash = await hashPassword(PASSWORD);
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
    .values({
      email: a.email,
      role: a.role,
      firstName: a.firstName,
      lastName: a.lastName,
      passwordHash,
      isActive: true,
    })
    .returning({ id: users.id });
  return created.id;
}

async function upsertAssignment(projectId: string, supervisorId: string, ended: boolean): Promise<void> {
  const existing = await db.query.supervisorAssignments.findFirst({
    where: and(
      eq(supervisorAssignments.projectId, projectId),
      eq(supervisorAssignments.supervisorId, supervisorId),
    ),
  });

  if (existing) {
    await db
      .update(supervisorAssignments)
      .set({ endedAt: ended ? new Date() : null })
      .where(eq(supervisorAssignments.id, existing.id));
    return;
  }

  await db.insert(supervisorAssignments).values({
    projectId,
    supervisorId,
    isPrimary: !ended,
    endedAt: ended ? new Date() : null,
  });
}

async function main(): Promise<void> {
  const ids: Record<string, string> = {};
  for (const a of ACCOUNTS) {
    ids[a.key] = await upsertUser(a);
  }

  const existingProject = await db.query.projects.findFirst({
    where: eq(projects.studentId, ids.owner),
  });

  let projectId: string;
  if (existingProject) {
    projectId = existingProject.id;
    await db.update(projects).set({ title: PROJECT_TITLE, status: 'active' }).where(eq(projects.id, projectId));
  } else {
    const [created] = await db
      .insert(projects)
      .values({ studentId: ids.owner, title: PROJECT_TITLE, description: 'Fixture for authorization tests.' })
      .returning({ id: projects.id });
    projectId = created.id;
  }

  await upsertAssignment(projectId, ids.superAssigned, false); // active
  await upsertAssignment(projectId, ids.superEnded, true); // ended → no access

  const summary = {
    password: PASSWORD,
    projectId,
    owner: ACCOUNTS[0].email,
    other: ACCOUNTS[1].email,
    superAssigned: ACCOUNTS[2].email,
    superOutsider: ACCOUNTS[3].email,
    superEnded: ACCOUNTS[4].email,
    admin: process.env.ADMIN_EMAIL ?? 'admin@thesistrack.local',
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
