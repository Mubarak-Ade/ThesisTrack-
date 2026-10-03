import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';

import { db } from '../../config/db.js';
import {
  milestoneTemplates,
  milestones,
  proposalAttachments,
  proposals,
  projectStages,
  projects,
  reviews,
  supervisorAssignments,
} from '../../schema/index.js';
import type { UserRow } from '../users/types.js';
import type { ProjectRow } from '../projects/types.js';
import type {
  MilestoneTemplateRow,
  ProposalAttachmentRow,
  ProposalListFilters,
  ProposalRow,
  ProposalWithStudent,
  ReviewRow,
} from './types.js';

/**
 * Drizzle queries only — no Express, no business rules (§9.3, ADR-02).
 *
 * Rows of OTHER modules' tables (`projects`, `supervisor_assignments`,
 * `milestone_templates`) are queried here because §5.4's
 * approval transaction must touch them **inside one transaction**; importing
 * those modules' `repository.ts` is what ADR-02 forbids, and shared schema
 * tables are data, not behavior.
 */

/** Multi-statement units run inside the caller's transaction (§5.4). */
export type WriteExecutor = Pick<typeof db, 'insert' | 'update' | 'delete'>;

/* ------------------------------------------------------------------ reads */

export function findProposalById(id: string): Promise<ProposalRow | undefined> {
  return db.query.proposals.findFirst({ where: eq(proposals.id, id) });
}

export function findProposalDetailById(id: string): Promise<ProposalWithStudent | undefined> {
  return db.query.proposals.findFirst({
    where: eq(proposals.id, id),
    with: { student: true },
  });
}

export function findAttachmentWithProposal(
  id: string,
): Promise<(ProposalAttachmentRow & { proposal: ProposalRow }) | undefined> {
  return db.query.proposalAttachments.findFirst({
    where: eq(proposalAttachments.id, id),
    with: { proposal: true },
  });
}

/** Filtered page plus total — the §11.3 `?status&studentId&page&limit` list. */
export async function listProposals(
  filters: ProposalListFilters,
): Promise<{ rows: ProposalWithStudent[]; total: number }> {
  const conditions: SQL[] = [];

  // Scope. `studentIds` is never empty — the service returns early instead
  // (an empty IN list would mean "no rows", not "no filter").
  if (filters.studentIds) {
    conditions.push(inArray(proposals.studentId, filters.studentIds));
  }
  if (filters.studentId) {
    conditions.push(eq(proposals.studentId, filters.studentId));
  }
  if (filters.status) {
    conditions.push(eq(proposals.status, filters.status));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, counted] = await Promise.all([
    db.query.proposals.findMany({
      where,
      orderBy: [desc(proposals.createdAt), desc(proposals.id)],
      limit: filters.limit,
      offset: (filters.page - 1) * filters.limit,
      with: { student: true },
    }),
    db.select({ total: sql<string>`count(*)` }).from(proposals).where(where),
  ]);

  return { rows, total: Number(counted[0]?.total ?? 0) };
}

/**
 * I4 conflict counter — the same predicate the partial unique index enforces
 * (§8.3): one IN-FLIGHT proposal per student.
 */
export async function countInFlightProposals(studentId: string): Promise<number> {
  const rows = await db
    .select({ total: sql<string>`count(*)` })
    .from(proposals)
    .where(
      and(
        eq(proposals.studentId, studentId),
        sql`status IN ('draft','submitted','under_review','revision_required')`,
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

/** I1 pre-check for the approval transaction: does the student have a live project? */
export function findActiveProjectForStudent(studentId: string): Promise<{ id: string } | undefined> {
  return db.query.projects.findFirst({
    where: and(eq(projects.studentId, studentId), eq(projects.status, 'active')),
    columns: { id: true },
  });
}

/** The student's single active assignment (I13) — approval-recipient lookup. */
export function findActiveAssignmentByStudent(
  studentId: string,
): Promise<{ supervisorId: string } | undefined> {
  return db.query.supervisorAssignments.findFirst({
    where: and(
      eq(supervisorAssignments.studentId, studentId),
      isNull(supervisorAssignments.endedAt),
    ),
    columns: { supervisorId: true },
  });
}

/** All versions of a proposal's documents, newest first (§11.3). */
export function listAttachments(proposalId: string): Promise<ProposalAttachmentRow[]> {
  return db.query.proposalAttachments.findMany({
    where: eq(proposalAttachments.proposalId, proposalId),
    orderBy: [
      desc(proposalAttachments.proposalVersion),
      desc(proposalAttachments.createdAt),
      desc(proposalAttachments.id),
    ],
  });
}

export async function countAttachments(proposalId: string): Promise<number> {
  const rows = await db
    .select({ total: sql<string>`count(*)` })
    .from(proposalAttachments)
    .where(eq(proposalAttachments.proposalId, proposalId));
  return Number(rows[0]?.total ?? 0);
}

/** Append-only review history, newest first (§11.3, §12 I8). */
export function listReviews(
  proposalId: string,
): Promise<Array<ReviewRow & { reviewer: UserRow }>> {
  return db.query.reviews.findMany({
    where: eq(reviews.proposalId, proposalId),
    orderBy: [desc(reviews.createdAt), desc(reviews.id)],
    with: { reviewer: true },
  });
}

export function findTemplateById(id: string): Promise<MilestoneTemplateRow | undefined> {
  return db.query.milestoneTemplates.findFirst({ where: eq(milestoneTemplates.id, id) });
}

/** Name lookup for the §5.4 `Default` fallback — oldest row wins. */
export function findTemplateByName(name: string): Promise<MilestoneTemplateRow | undefined> {
  return db.query.milestoneTemplates.findFirst({
    where: eq(milestoneTemplates.name, name),
    orderBy: [asc(milestoneTemplates.createdAt), asc(milestoneTemplates.id)],
  });
}

/* ----------------------------------------------------------------- writes */

export async function insertProposal(
  values: typeof proposals.$inferInsert,
  executor: WriteExecutor = db,
): Promise<ProposalRow> {
  const [created] = await executor.insert(proposals).values(values).returning();
  return created;
}

/**
 * Conditional edit — only a `draft`/`revision_required` row flips. The loser
 * of a race sees `undefined` and reports the same 422 the workflow guard
 * would have (the state moved between guard and write).
 */
export async function editProposal(
  id: string,
  values: { title?: string; abstract?: string; body?: string | null },
  executor: WriteExecutor = db,
): Promise<ProposalRow | undefined> {
  const [updated] = await executor
    .update(proposals)
    .set({
      // Spread so `undefined` keys never reach SQL (drizzle would write NULL).
      ...(values.title !== undefined ? { title: values.title } : {}),
      ...(values.abstract !== undefined ? { abstract: values.abstract } : {}),
      ...(values.body !== undefined ? { body: values.body } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(proposals.id, id),
        inArray(proposals.status, ['draft', 'revision_required']),
      ),
    )
    .returning();
  return updated;
}

/** §11.3 submit: `status = submitted`, `version++`, `submitted_at = now()`. */
export async function markSubmitted(
  id: string,
  executor: WriteExecutor = db,
): Promise<ProposalRow | undefined> {
  const [updated] = await executor
    .update(proposals)
    .set({
      status: 'submitted',
      version: sql`${proposals.version} + 1`,
      submittedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(proposals.id, id),
        inArray(proposals.status, ['draft', 'revision_required']),
      ),
    )
    .returning();
  return updated;
}

/**
 * Guarded status transition (§5.4): flips only if the row is still in one of
 * `fromStatuses`, so a racing second decision cannot overwrite the first.
 */
export async function transitionProposal(
  id: string,
  toStatus: ProposalRow['status'],
  fromStatuses: readonly ProposalRow['status'][],
  executor: WriteExecutor = db,
): Promise<ProposalRow | undefined> {
  const [updated] = await executor
    .update(proposals)
    .set({ status: toStatus, updatedAt: new Date() })
    .where(and(eq(proposals.id, id), inArray(proposals.status, [...fromStatuses])))
    .returning();
  return updated;
}

/** §5.4 step 2 — back-fill the approved proposal with its project id. */
export async function backfillProposalProject(
  id: string,
  projectId: string,
  executor: WriteExecutor = db,
): Promise<void> {
  await executor
    .update(proposals)
    .set({ projectId, updatedAt: new Date() })
    .where(eq(proposals.id, id));
}

export async function insertProject(
  values: typeof projects.$inferInsert,
  executor: WriteExecutor = db,
): Promise<ProjectRow> {
  const [created] = await executor.insert(projects).values(values).returning();
  return created;
}

/**
 * §5.4 step 3 — attach the student's active assignment to the new project.
 * No `supervisor_id` clause: I13 guarantees at most one active row per
 * student, and the approver may be an administrator rather than that
 * supervisor.
 */
export async function backfillActiveAssignmentProject(
  studentId: string,
  projectId: string,
  executor: WriteExecutor = db,
): Promise<void> {
  await executor
    .update(supervisorAssignments)
    .set({ projectId })
    .where(
      and(
        eq(supervisorAssignments.studentId, studentId),
        isNull(supervisorAssignments.endedAt),
      ),
    );
}

/** §5.4 step 4 — materialise template items as milestone rows (bulk). */
export async function insertMilestones(
  values: Array<typeof milestones.$inferInsert>,
  executor: WriteExecutor = db,
): Promise<void> {
  if (values.length === 0) return; // empty template → zero milestones, never a failure
  await executor.insert(milestones).values(values);
}

/**
 * §5.4 step 5 — the ADR-15 stage snapshot (§8.11): every descriptive and
 * gating field COPIED from the definition, stage 1 already `active` (§5.9).
 * Empty set is a no-op: no resolved workflow → zero stages, never a failure
 * (§3.4). Lives in THIS repository because §5.4's transaction must touch it
 * inside this unit — ADR-02 forbids importing another module's repository,
 * and shared schema tables are data, not behavior (§5.4 note).
 */
export async function insertProjectStages(
  values: Array<typeof projectStages.$inferInsert>,
  executor: WriteExecutor = db,
): Promise<void> {
  if (values.length === 0) return;
  await executor.insert(projectStages).values(values);
}

/**
 * §5.9 automatic advancement — the second half of step 5: an approval-gated
 * stage 1 is satisfied by THIS approval (step 2 flipped the proposal), so the
 * same transaction completes it and activates stage 2 rather than leaving the
 * supervisor to click through a stage the approval itself already finished.
 * Both UPDATEs are conditional; no stage 2 row (single-stage workflow) means
 * the tracker legitimately ends with ZERO active stages (I16: *at most* one).
 */
export async function autoAdvanceFirstStage(
  projectId: string,
  actorId: string,
  executor: WriteExecutor = db,
): Promise<void> {
  const now = new Date();
  await executor
    .update(projectStages)
    .set({ status: 'completed', completedAt: now, completedBy: actorId })
    .where(
      and(
        eq(projectStages.projectId, projectId),
        eq(projectStages.position, 1),
        eq(projectStages.status, 'active'),
      ),
    );
  await executor
    .update(projectStages)
    .set({ status: 'active', startedAt: now, startedBy: actorId })
    .where(
      and(
        eq(projectStages.projectId, projectId),
        eq(projectStages.position, 2),
        eq(projectStages.status, 'pending'),
      ),
    );
}

export async function insertReview(
  values: typeof reviews.$inferInsert,
  executor: WriteExecutor = db,
): Promise<ReviewRow> {
  const [created] = await executor.insert(reviews).values(values).returning();
  return created;
}

export async function insertAttachment(
  values: typeof proposalAttachments.$inferInsert,
  executor: WriteExecutor = db,
): Promise<ProposalAttachmentRow> {
  const [created] = await executor.insert(proposalAttachments).values(values).returning();
  return created;
}

/**
 * Deletes the row and returns it (its `storage_key` tells the service which
 * bytes to unlink). Row first, file second: an orphaned file is inert, a row
 * pointing at missing bytes would 404 forever.
 *
 * The I14 freeze is re-checked *inside* the statement — attachments are
 * removable only while the parent proposal is `draft`/`revision_required`, so
 * the invariant holds even if the proposal's status moved after the workflow
 * guard read it.
 */
export async function deleteAttachment(
  id: string,
  executor: WriteExecutor = db,
): Promise<ProposalAttachmentRow | undefined> {
  const [removed] = await executor
    .delete(proposalAttachments)
    .where(
      and(
        eq(proposalAttachments.id, id),
        sql`EXISTS (SELECT 1 FROM proposals WHERE id = proposal_id AND status IN ('draft','revision_required'))`,
      ),
    )
    .returning();
  return removed;
}
