import { and, asc, desc, eq, gte, inArray, lte, ne, sql, type SQL } from 'drizzle-orm';

import { db } from '../../config/db.js';
import {
  projectStages,
  projects,
  proposals,
  reviews,
  submissions,
  workflowStages,
  workflows,
} from '../../schema/index.js';
import type { GateFacts, ProjectStageRow, WorkflowRow, WorkflowStageRow } from './types.js';

/**
 * Drizzle queries only — no Express, no business rules (§9.3, ADR-02).
 *
 * `proposals` / `submissions` / `reviews` are read here because the §11.14
 * gates evaluate against them (§11.14 gate table); querying another module's
 * *table* as data is the §5.4 precedent — importing another module's
 * `repository.ts` would be the violation (ADR-02), and this file does not.
 */

/** Multi-statement units run inside the caller's transaction (§9.1). */
export type WriteExecutor = Pick<typeof db, 'insert' | 'update' | 'delete'>;

/* ------------------------------------------------------------ definition */

export interface WorkflowListFilters {
  program: string | null;
  includeArchived: boolean;
  page: number;
  limit: number;
}

/** Filtered page plus total — §11.14's `?program&includeArchived&page&limit`. */
export async function listWorkflows(
  filters: WorkflowListFilters,
): Promise<{ rows: WorkflowRow[]; total: number }> {
  const conditions: SQL[] = [];

  if (!filters.includeArchived) {
    conditions.push(sql`archived_at is null`);
  }
  if (filters.program) {
    // Case-insensitive, matching the `lower(program)` unique index (§8.10) —
    // the filter must agree with what the database considers "the same".
    conditions.push(sql`lower(program) = lower(${filters.program})`);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, counted] = await Promise.all([
    db.query.workflows.findMany({
      where,
      orderBy: [desc(workflows.isDefault), asc(workflows.name), asc(workflows.id)],
      limit: filters.limit,
      offset: (filters.page - 1) * filters.limit,
    }),
    db.select({ total: sql<string>`count(*)` }).from(workflows).where(where),
  ]);

  return { rows, total: Number(counted[0]?.total ?? 0) };
}

export function findWorkflowById(id: string): Promise<WorkflowRow | undefined> {
  return db.query.workflows.findFirst({ where: eq(workflows.id, id) });
}

/** Ordered definition stages (FR-CW-02 — position ascending, contiguous). */
export function listWorkflowStages(workflowId: string): Promise<WorkflowStageRow[]> {
  return db.query.workflowStages.findMany({
    where: eq(workflowStages.workflowId, workflowId),
    orderBy: [asc(workflowStages.position), asc(workflowStages.id)],
  });
}

/**
 * ADR-16 branch 2 — the ONE active workflow for a program (FR-CW-08).
 * The `lower()` comparison is what the partial unique index enforces, so the
 * lookup agrees with what can actually exist.
 */
export function findActiveWorkflowByProgram(program: string): Promise<WorkflowRow | undefined> {
  return db.query.workflows.findFirst({
    where: sql`archived_at is null AND lower(program) = lower(${program})`,
    orderBy: [asc(workflows.createdAt), asc(workflows.id)],
  });
}

/** ADR-16 branch 3 — the flagged default fallback (§8.10 seed). */
export function findDefaultWorkflow(): Promise<WorkflowRow | undefined> {
  return db.query.workflows.findFirst({
    where: sql`archived_at is null AND is_default`,
    orderBy: [asc(workflows.createdAt), asc(workflows.id)],
  });
}

/**
 * Conflict pre-check for the one-active-per-program slot: how many OTHER
 * active workflows already hold this program (§8.10 → 409).
 */
export async function countOtherActiveWorkflowsForProgram(
  program: string,
  excludeWorkflowId: string | null,
): Promise<number> {
  const rows = await db
    .select({ total: sql<string>`count(*)` })
    .from(workflows)
    .where(
      and(
        sql`archived_at is null`,
        sql`lower(program) = lower(${program})`,
        excludeWorkflowId ? ne(workflows.id, excludeWorkflowId) : undefined,
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

/** §11.14 DELETE — does any project reference this definition (I15)? */
export async function countProjectsReferencing(workflowId: string): Promise<number> {
  const rows = await db
    .select({ total: sql<string>`count(*)` })
    .from(projects)
    .where(eq(projects.workflowId, workflowId));
  return Number(rows[0]?.total ?? 0);
}

/* --------------------------------------------------------- project stages */

export function listProjectStages(projectId: string): Promise<ProjectStageRow[]> {
  return db.query.projectStages.findMany({
    where: eq(projectStages.projectId, projectId),
    orderBy: [asc(projectStages.position), asc(projectStages.id)],
  });
}

export function findActiveStage(projectId: string): Promise<ProjectStageRow | undefined> {
  return db.query.projectStages.findFirst({
    where: and(eq(projectStages.projectId, projectId), eq(projectStages.status, 'active')),
  });
}

/** The lowest position strictly after `position` — the stage advance activates. */
export function findNextStage(
  projectId: string,
  position: number,
): Promise<ProjectStageRow | undefined> {
  return db.query.projectStages.findFirst({
    where: and(eq(projectStages.projectId, projectId), sql`${projectStages.position} > ${position}`),
    orderBy: [asc(projectStages.position), asc(projectStages.id)],
  });
}

/* ------------------------------------------------------------ gate facts */

/**
 * The §11.14 gate table evaluated against real rows.
 *
 * Window semantics: "during this stage" = `started_at ≤ created_at ≤
 * completed_at` (open-ended while the stage is active). A stage that never
 * started has no window, so its submission facts are false — only the
 * proposal branch is evaluated independently of the window.
 */
export async function collectGateFacts(
  projectId: string,
  stage: { startedAt: Date | null; completedAt: Date | null },
): Promise<GateFacts> {
  const proposalRows = await db
    .select({ one: sql<string>`1` })
    .from(proposals)
    .where(and(eq(proposals.projectId, projectId), eq(proposals.status, 'approved')))
    .limit(1);

  const base: GateFacts = {
    proposalApproved: proposalRows.length > 0,
    submissionInWindow: false,
    reviewedSubmissionInWindow: false,
    approvedReviewedSubmissionInWindow: false,
  };
  if (!stage.startedAt) {
    return base; // the stage never started — nothing happened "during" it
  }

  const window: SQL[] = [gte(submissions.createdAt, stage.startedAt)];
  if (stage.completedAt) {
    window.push(lte(submissions.createdAt, stage.completedAt));
  }
  const inWindow = and(eq(submissions.projectId, projectId), ...window);

  const [subs, reviewed, approved] = await Promise.all([
    db.select({ one: sql<string>`1` }).from(submissions).where(inWindow).limit(1),
    db
      .select({ one: sql<string>`1` })
      .from(submissions)
      .innerJoin(reviews, eq(reviews.submissionId, submissions.id))
      .where(inWindow)
      .limit(1),
    db
      .select({ one: sql<string>`1` })
      .from(submissions)
      .innerJoin(reviews, eq(reviews.submissionId, submissions.id))
      .where(and(inWindow, eq(reviews.decision, 'approved')))
      .limit(1),
  ]);

  return {
    ...base,
    submissionInWindow: subs.length > 0,
    reviewedSubmissionInWindow: reviewed.length > 0,
    approvedReviewedSubmissionInWindow: approved.length > 0,
  };
}

/* ---------------------------------------------------------------- writes */

export async function insertWorkflow(
  values: typeof workflows.$inferInsert,
  executor: WriteExecutor = db,
): Promise<WorkflowRow> {
  const [created] = await executor.insert(workflows).values(values).returning();
  return created;
}

export async function updateWorkflow(
  id: string,
  values: Partial<typeof workflows.$inferInsert>,
  executor: WriteExecutor = db,
): Promise<WorkflowRow | undefined> {
  const [updated] = await executor
    .update(workflows)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(workflows.id, id))
    .returning();
  return updated;
}

/**
 * Set-default half 1 (§16.3 PROPOSED delta): clear THE flagged default before
 * flagging another — the §8.10 `workflows_one_default` partial unique index
 * admits at most one active default, so the order is what keeps the pair a
 * single atomic move rather than a 23505 the client has to retry.
 */
export async function clearDefaultFlag(executor: WriteExecutor = db): Promise<void> {
  await executor
    .update(workflows)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(sql`is_default`);
}

export async function deleteWorkflow(
  id: string,
  executor: WriteExecutor = db,
): Promise<WorkflowRow | undefined> {
  const [deleted] = await executor.delete(workflows).where(eq(workflows.id, id)).returning();
  return deleted;
}

export async function insertStage(
  values: typeof workflowStages.$inferInsert,
  executor: WriteExecutor = db,
): Promise<WorkflowStageRow> {
  const [created] = await executor.insert(workflowStages).values(values).returning();
  return created;
}

/** Whole-set edit primitive — always scoped to the owning workflow. */
export async function updateStage(
  id: string,
  workflowId: string,
  values: Partial<typeof workflowStages.$inferInsert>,
  executor: WriteExecutor = db,
): Promise<WorkflowStageRow | undefined> {
  const [updated] = await executor
    .update(workflowStages)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(workflowStages.id, id), eq(workflowStages.workflowId, workflowId)))
    .returning();
  return updated;
}

/**
 * Guarded delete for the whole-set PATCH: a stage that projects have already
 * snapshotted is academic history (ADR-15) — the `NOT EXISTS` clause makes the
 * FK's RESTRICT a 422 the service can explain instead of a 500 (§8.11).
 */
export async function deleteStageIfUnreferenced(
  id: string,
  workflowId: string,
  executor: WriteExecutor = db,
): Promise<WorkflowStageRow | undefined> {
  const [deleted] = await executor
    .delete(workflowStages)
    .where(
      and(
        eq(workflowStages.id, id),
        eq(workflowStages.workflowId, workflowId),
        sql`NOT EXISTS (SELECT 1 FROM project_stages WHERE workflow_stage_id = ${id})`,
      ),
    )
    .returning();
  return deleted;
}

/** How many of `stageIds` are referenced by materialised project stages. */
export async function countStagesReferencedByProjects(stageIds: string[]): Promise<number> {
  if (stageIds.length === 0) return 0;
  const rows = await db
    .select({ total: sql<string>`count(*)` })
    .from(workflowStages)
    .where(
      and(
        inArray(workflowStages.id, stageIds),
        sql`EXISTS (SELECT 1 FROM project_stages WHERE workflow_stage_id = workflow_stages.id)`,
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

/** §11.14 advance, half 1 — only the currently-active row may complete. */
export async function completeStage(
  id: string,
  actorId: string,
  executor: WriteExecutor = db,
): Promise<ProjectStageRow | undefined> {
  const [row] = await executor
    .update(projectStages)
    .set({ status: 'completed', completedAt: new Date(), completedBy: actorId })
    .where(and(eq(projectStages.id, id), eq(projectStages.status, 'active')))
    .returning();
  return row;
}

/** §11.14 advance, half 2 — only a pending row may activate (I16 backstop). */
export async function activateStage(
  id: string,
  actorId: string,
  executor: WriteExecutor = db,
): Promise<ProjectStageRow | undefined> {
  const [row] = await executor
    .update(projectStages)
    .set({ status: 'active', startedAt: new Date(), startedBy: actorId })
    .where(and(eq(projectStages.id, id), eq(projectStages.status, 'pending')))
    .returning();
  return row;
}

/**
 * Renumber safety for whole-set edits: `UNIQUE (workflow_id, position)` makes
 * a direct 1..n rewrite collide mid-flight whenever two stages swap or close
 * a gap. Lifting every position out of the 1..n range first (the set is capped
 * at 50 stages per request) makes the second pass collision-free.
 */
export async function liftStagePositions(
  workflowId: string,
  executor: WriteExecutor = db,
): Promise<void> {
  await executor
    .update(workflowStages)
    .set({ position: sql`${workflowStages.position} + 10000` })
    .where(eq(workflowStages.workflowId, workflowId));
}
