import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';

import { db } from '../config/db.js';
import { projectStages, users, workflowStages, workflows } from '../schema/index.js';

/**
 * Seeds the workflow definitions required by spec §8.10 (ADR-15/ADR-16):
 *
 *   - `Default`  — program NULL, `is_default = true`: ADR-16's fallback
 *   - `Software Engineering`, `Zoology / Field Sciences` — one per §3.3
 *     discipline, so FR-CW-08's one-active-workflow-per-program (and therefore
 *     ADR-16's program match) is demonstrable out of the box.
 *
 * Idempotent and safe to re-run, like `seed:templates`: a workflow is matched
 * by `name` and repaired (re-activated, metadata refreshed, stage set brought
 * back to the seed order). Stage positions use a lift-then-assign pass because
 * `UNIQUE (workflow_id, position)` makes a direct 1..n rewrite collide
 * mid-flight (§8.10). A seed workflow whose program slot is already held by
 * another active workflow, or whose extra stages are materialised by live
 * projects, is reported and left alone — the seed never breaks a database.
 *
 *   pnpm seed:workflows                      → prints JSON
 *
 * Gates follow §11.14: `Approval` requires approval (satisfied by §5.4's
 * proposal approval for approval-flow projects); `Progress Review` and
 * `Final Submission` require an in-window submission and its review. Stage 1
 * of every seed workflow is ungated on purpose: materialisation activates it
 * at project creation (§5.9), and §5.9's automatic advancement only completes
 * a stage whose conditions the approval actually satisfies — a gateless first
 * stage is the supervisor's to move.
 */

/** The executor shape the repair pass needs (schema reads + writes). */
type Executor = Pick<typeof db, 'query' | 'select' | 'insert' | 'update' | 'delete'>;

type SeedStage = {
  name: string;
  description: string | null;
  dueOffsetDays: number | null;
  deliverable: string | null;
  responsibleRole: 'student' | 'supervisor' | 'administrator';
  requiresSubmission: boolean;
  requiresReview: boolean;
  requiresApproval: boolean;
};

const stage = (name: string, overrides: Partial<SeedStage> = {}): SeedStage => ({
  name,
  description: null,
  dueOffsetDays: null,
  deliverable: null,
  responsibleRole: 'student',
  requiresSubmission: false,
  requiresReview: false,
  requiresApproval: false,
  ...overrides,
});

const approval = (dueOffsetDays: number): SeedStage =>
  stage('Approval', {
    dueOffsetDays,
    responsibleRole: 'supervisor',
    requiresApproval: true,
    deliverable: 'Approved proposal',
  });

const progressReview = (dueOffsetDays: number): SeedStage =>
  stage('Progress Review', {
    dueOffsetDays,
    responsibleRole: 'supervisor',
    requiresSubmission: true,
    requiresReview: true,
  });

const finalSubmission = (dueOffsetDays: number): SeedStage =>
  stage('Final Submission', {
    dueOffsetDays,
    requiresSubmission: true,
    requiresReview: true,
    deliverable: 'Completed thesis',
  });

type SeedWorkflow = {
  name: string;
  program: string | null;
  academicSession: string | null;
  description: string;
  isDefault: boolean;
  stages: SeedStage[];
};

const SEEDS: SeedWorkflow[] = [
  {
    // §8.10's prescribed stage list, verbatim.
    name: 'Default',
    program: null,
    academicSession: null,
    description:
      'Discipline-neutral process (spec §8.10) — ADR-16’s fallback when no program matches.',
    isDefault: true,
    stages: [
      stage('Topic', { dueOffsetDays: 7 }),
      stage('Proposal', { dueOffsetDays: 14 }),
      approval(21),
      stage('Development', { dueOffsetDays: 60 }),
      progressReview(90),
      finalSubmission(120),
    ],
  },
  {
    // §3.3: Proposal → Approval → Development → Progress Review → Final Submission.
    name: 'Software Engineering',
    program: 'Software Engineering',
    academicSession: null,
    description: 'Software Engineering project process (spec §3.3).',
    isDefault: false,
    stages: [
      stage('Proposal', { dueOffsetDays: 14 }),
      approval(21),
      stage('Development', { dueOffsetDays: 60 }),
      progressReview(90),
      finalSubmission(120),
    ],
  },
  {
    // §3.3: Proposal → Approval → Field Work → Laboratory Work → Analysis →
    // Report → Final Submission.
    name: 'Zoology / Field Sciences',
    program: 'Zoology / Field Sciences',
    academicSession: null,
    description: 'Field and laboratory sciences process (spec §3.3).',
    isDefault: false,
    stages: [
      stage('Proposal', { dueOffsetDays: 14 }),
      approval(21),
      stage('Field Work', { dueOffsetDays: 45 }),
      stage('Laboratory Work', { dueOffsetDays: 70 }),
      stage('Analysis', { dueOffsetDays: 90 }),
      stage('Report', { dueOffsetDays: 110, responsibleRole: 'supervisor' }),
      finalSubmission(125),
    ],
  },
];

const stageValues = (workflowId: string, seed: SeedStage, position: number) => ({
  workflowId,
  position,
  name: seed.name,
  description: seed.description,
  dueOffsetDays: seed.dueOffsetDays,
  deliverable: seed.deliverable,
  responsibleRole: seed.responsibleRole,
  requiresSubmission: seed.requiresSubmission,
  requiresReview: seed.requiresReview,
  requiresApproval: seed.requiresApproval,
});

/**
 * Bring one workflow's stage set back to the seed order, inside the caller's
 * transaction. Extra seed-length stages are deleted only when unreferenced —
 * ADR-15: snapshots materialised by live projects are frozen history (§8.11's
 * RESTRICT makes rewriting them impossible anyway, which is the point).
 */
async function repairStages(
  tx: Executor,
  workflowId: string,
  desired: SeedStage[],
  notes: string[],
): Promise<void> {
  const existing = await tx.query.workflowStages.findMany({
    where: eq(workflowStages.workflowId, workflowId),
    orderBy: [asc(workflowStages.position), asc(workflowStages.id)],
  });

  const extras = existing.slice(desired.length);
  if (extras.length > 0) {
    const referenced = await tx
      .select({ total: sql<string>`count(*)` })
      .from(projectStages)
      .where(inArray(projectStages.workflowStageId, extras.map((row) => row.id)));
    if (Number(referenced[0]?.total ?? 0) > 0) {
      notes.push(
        `${workflowId}: surplus stages are referenced by projects — stage set left unchanged`,
      );
      return; // metadata above stays repaired; the stage set is off-limits
    }
    for (const extra of extras) {
      await tx.delete(workflowStages).where(eq(workflowStages.id, extra.id));
    }
  }

  if (existing.length > 0) {
    // Lift-then-assign: UNIQUE (workflow_id, position) rejects a direct 1..n
    // rewrite whenever the new order shifts (§8.10).
    await tx
      .update(workflowStages)
      .set({ position: sql`${workflowStages.position} + 10000` })
      .where(eq(workflowStages.workflowId, workflowId));
  }

  for (const [index, seed] of desired.entries()) {
    const previous = existing[index];
    if (previous) {
      await tx
        .update(workflowStages)
        .set({ ...stageValues(workflowId, seed, index + 1), updatedAt: new Date() })
        .where(and(eq(workflowStages.id, previous.id), eq(workflowStages.workflowId, workflowId)));
    } else {
      await tx.insert(workflowStages).values(stageValues(workflowId, seed, index + 1));
    }
  }
}

async function main(): Promise<void> {
  const adminEmail = (process.env.ADMIN_EMAIL ?? 'admin@thesistrack.local').trim().toLowerCase();
  const admin = await db.query.users.findFirst({ where: eq(users.email, adminEmail) });
  const createdBy = admin?.id ?? null; // created_by is nullable (§8.10)

  const summary: Record<string, string> = {};
  const notes: string[] = [];
  let totalStages = 0;

  for (const def of SEEDS) {
    try {
      const workflowId = await db.transaction(async (tx) => {
        const existing = await tx.query.workflows.findFirst({
          where: eq(workflows.name, def.name),
        });

        let id: string;
        if (existing) {
          if (def.isDefault) {
            // ADR-16's fallback must be unique: clear any other default first.
            await tx
              .update(workflows)
              .set({ isDefault: false, updatedAt: new Date() })
              .where(
                and(
                  isNull(workflows.archivedAt),
                  ne(workflows.id, existing.id),
                  eq(workflows.isDefault, true),
                ),
              );
          }
          const [updated] = await tx
            .update(workflows)
            .set({
              program: def.program,
              academicSession: def.academicSession,
              description: def.description,
              isDefault: def.isDefault,
              archivedAt: null, // repair: a seeded workflow is active
              updatedAt: new Date(),
            })
            .where(eq(workflows.id, existing.id))
            .returning();
          id = updated.id;
        } else {
          const [created] = await tx
            .insert(workflows)
            .values({
              name: def.name,
              program: def.program,
              academicSession: def.academicSession,
              description: def.description,
              isDefault: def.isDefault,
              createdBy,
            })
            .returning();
          id = created.id;
        }

        await repairStages(tx, id, def.stages, notes);
        return id;
      });

      summary[def.name] = workflowId;
      totalStages += def.stages.length;
    } catch (err) {
      if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
        // FR-CW-08's one-active-per-program slot (or the single-default slot)
        // is already held — the seed yields rather than clobbering a human's
        // choice; a re-run after the conflict clears repairs it.
        notes.push(
          def.program
            ? `${def.name}: another active workflow already holds program "${def.program}" — skipped`
            : `${def.name}: the default-workflow slot is held elsewhere — skipped`,
        );
        continue;
      }
      throw err;
    }
  }

  console.log(
    JSON.stringify(
      {
        workflows: Object.keys(summary).length,
        stages: totalStages,
        default: SEEDS.find((def) => def.isDefault)?.name,
        createdBy: createdBy ?? 'anonymous (no admin yet)',
        notes,
        ...summary,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
