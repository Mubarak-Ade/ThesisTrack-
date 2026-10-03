import { and, eq, ilike, inArray, isNotNull, sql, type SQL } from 'drizzle-orm';

import { db } from '../../config/db.js';
import { isValidUuid } from '../../lib/uuid.js';
import {
  feedback,
  milestones,
  projectStages,
  projects,
  proposals,
  reviews,
  submissions,
  supervisorAssignments,
  users,
} from '../../schema/index.js';
import type { ProjectListFilters, ProjectRow } from './types.js';

// Re-exported so existing importers keep working — the implementation moved to
// lib/ so the authz guards can share it without reaching into a module
// repository (ADR-02).
export { isValidUuid };

/** Multi-statement units run inside the caller's transaction (§9.1). */
export type WriteExecutor = Pick<typeof db, 'insert' | 'update' | 'delete'>;

/* ------------------------------------------------------------------ reads */

/** Returns undefined for unknown *and* malformed ids (never reaches Postgres). */
export async function findProjectById(id: string): Promise<ProjectRow | undefined> {
  if (!isValidUuid(id)) return undefined;
  return db.query.projects.findFirst({ where: eq(projects.id, id) });
}

/** I1 pre-check — does the student already hold an ACTIVE project? */
export async function findActiveProjectForStudent(
  studentId: string,
): Promise<{ id: string } | undefined> {
  return db.query.projects.findFirst({
    where: and(eq(projects.studentId, studentId), eq(projects.status, 'active')),
    columns: { id: true },
  });
}

/**
 * Supervisor scope for §11.2: the projects of this supervisor's ACTIVE
 * assignments. Keyed on `assignment.project_id` exactly like §13.3's
 * resource guard — a student-scoped assignment row (project not yet
 * materialised) contributes nothing.
 */
export async function listActiveAssignedProjectIds(supervisorId: string): Promise<string[]> {
  const rows = await db
    .select({ projectId: supervisorAssignments.projectId })
    .from(supervisorAssignments)
    .where(
      and(
        eq(supervisorAssignments.supervisorId, supervisorId),
        sql`ended_at is null`,
        isNotNull(supervisorAssignments.projectId),
      ),
    );
  return rows.map((row) => row.projectId!).filter((id) => id !== null);
}

/** Filtered page plus total — §11.2 `?status&q`, scoped by role (§4.5). */
export async function listProjects(
  filters: ProjectListFilters,
): Promise<{ rows: Array<ProjectRow & { student: { id: string; firstName: string; lastName: string; email: string } }>; total: number }> {
  const conditions: SQL[] = [];

  if (filters.studentId) {
    conditions.push(eq(projects.studentId, filters.studentId));
  }
  if (filters.projectIds) {
    // Caller returns early on an empty supervisor scope (an IN () would mean
    // "all rows" to some planners and "none" to others — never gamble).
    conditions.push(inArray(projects.id, filters.projectIds));
  }
  if (filters.status) {
    conditions.push(eq(projects.status, filters.status));
  }
  if (filters.q) {
    conditions.push(ilike(projects.title, `%${filters.q}%`));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, counted] = await Promise.all([
    db.query.projects.findMany({
      where,
      orderBy: [sql`${projects.createdAt} desc`, sql`${projects.id} desc`],
      limit: filters.limit,
      offset: (filters.page - 1) * filters.limit,
      with: { student: true },
    }),
    db.select({ total: sql<string>`count(*)` }).from(projects).where(where),
  ]);

  const shaped = rows.map((row) => ({
    ...row,
    student: {
      id: row.student.id,
      firstName: row.student.firstName,
      lastName: row.student.lastName,
      email: row.student.email,
    },
  }));

  return { rows: shaped, total: Number(counted[0]?.total ?? 0) };
}

/* ----------------------------------------------------------- activity (§11.13) */

export interface ProposalSubmittedRow {
  id: string;
  title: string;
  studentId: string;
  /** Nullable in the schema; the query's isNotNull filters it — guard anyway. */
  at: Date | null;
}

export interface ProposalReviewRow {
  id: string;
  decision: string;
  reviewerId: string;
  at: Date;
}

export interface AssignmentChangedRow {
  id: string;
  assignedBy: string | null;
  assignedAt: Date;
  endedAt: Date | null;
}

export interface MilestoneCompletedRow {
  id: string;
  title: string;
  at: Date | null;
}

export interface SubmissionCreatedRow {
  id: string;
  title: string;
  submittedBy: string;
  at: Date;
}

export interface FeedbackCreatedRow {
  id: string;
  authorId: string;
  at: Date;
}

export interface StageTransitionRow {
  id: string;
  name: string;
  startedAt: Date | null;
  startedBy: string | null;
  completedAt: Date | null;
  completedBy: string | null;
}

/**
 * §11.13 sources — every query reads existing rows for ONE project. The
 * approval transaction is the only place other modules' tables are *written*
 * (ADR-02); reads here are the derived feed's whole implementation, and no
 * `activity_log` table exists to keep in sync (§11.13 REJECTED).
 */
export function listSubmittedProposals(projectId: string): Promise<ProposalSubmittedRow[]> {
  return db
    .select({
      id: proposals.id,
      title: proposals.title,
      studentId: proposals.studentId,
      at: proposals.submittedAt,
    })
    .from(proposals)
    .where(and(eq(proposals.projectId, projectId), isNotNull(proposals.submittedAt)));
}

export function listProposalReviews(projectId: string): Promise<ProposalReviewRow[]> {
  return db
    .select({
      id: reviews.id,
      decision: reviews.decision,
      reviewerId: reviews.reviewerId,
      at: reviews.createdAt,
    })
    .from(reviews)
    .innerJoin(proposals, eq(reviews.proposalId, proposals.id))
    .where(eq(proposals.projectId, projectId));
}

export function listAssignmentChanges(projectId: string): Promise<AssignmentChangedRow[]> {
  return db
    .select({
      id: supervisorAssignments.id,
      assignedBy: supervisorAssignments.assignedBy,
      assignedAt: supervisorAssignments.assignedAt,
      endedAt: supervisorAssignments.endedAt,
    })
    .from(supervisorAssignments)
    .where(eq(supervisorAssignments.projectId, projectId));
}

export function listCompletedMilestones(projectId: string): Promise<MilestoneCompletedRow[]> {
  return db
    .select({ id: milestones.id, title: milestones.title, at: milestones.completedAt })
    .from(milestones)
    .where(and(eq(milestones.projectId, projectId), isNotNull(milestones.completedAt)));
}

export function listSubmissions(projectId: string): Promise<SubmissionCreatedRow[]> {
  return db
    .select({
      id: submissions.id,
      title: submissions.title,
      submittedBy: submissions.submittedBy,
      at: submissions.createdAt,
    })
    .from(submissions)
    .where(eq(submissions.projectId, projectId));
}

export function listSubmissionReviews(projectId: string): Promise<ProposalReviewRow[]> {
  return db
    .select({
      id: reviews.id,
      decision: reviews.decision,
      reviewerId: reviews.reviewerId,
      at: reviews.createdAt,
    })
    .from(reviews)
    .innerJoin(submissions, eq(reviews.submissionId, submissions.id))
    .where(eq(submissions.projectId, projectId));
}

export function listFeedback(projectId: string): Promise<FeedbackCreatedRow[]> {
  return db
    .select({ id: feedback.id, authorId: feedback.authorId, at: feedback.createdAt })
    .from(feedback)
    .where(eq(feedback.projectId, projectId));
}

export function listStageTransitions(projectId: string): Promise<StageTransitionRow[]> {
  return db
    .select({
      id: projectStages.id,
      name: projectStages.name,
      startedAt: projectStages.startedAt,
      startedBy: projectStages.startedBy,
      completedAt: projectStages.completedAt,
      completedBy: projectStages.completedBy,
    })
    .from(projectStages)
    .where(eq(projectStages.projectId, projectId));
}

/** Resolve every actor id the feed collected in ONE query (§11.13 `actor`). */
export async function findActorNames(actorIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(actorIds)];
  if (unique.length === 0) return new Map();
  const rows = await db.query.users.findMany({
    where: inArray(users.id, unique),
    columns: { id: true, firstName: true, lastName: true },
  });
  return new Map(rows.map((row) => [row.id, `${row.firstName} ${row.lastName}`]));
}

/* ---------------------------------------------------------------- writes */

export async function insertProject(
  values: typeof projects.$inferInsert,
  executor: WriteExecutor = db,
): Promise<ProjectRow> {
  const [created] = await executor.insert(projects).values(values).returning();
  return created;
}

/**
 * §5.4 step 3's twin for manual creation — without this the student's
 * ACTIVE assignment still points at no project, and §13.3's projectId-keyed
 * guard would refuse the supervisor access to a project they supervise.
 * Same predicate as approval: student-keyed, no supervisor_id filter (I13).
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
        sql`ended_at is null`,
      ),
    );
}

/** §11.2 PATCH — partial update, only the keys provided reach SQL. */
export async function updateProject(
  id: string,
  values: { title?: string; description?: string; status?: 'active' | 'completed' | 'archived' },
  executor: WriteExecutor = db,
): Promise<ProjectRow | undefined> {
  const [updated] = await executor
    .update(projects)
    .set({
      ...(values.title !== undefined ? { title: values.title } : {}),
      ...(values.description !== undefined ? { description: values.description } : {}),
      ...(values.status !== undefined ? { status: values.status } : {}),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id))
    .returning();
  return updated;
}

/**
 * Manual-creation materialisation — the approval transaction's §5.4 step 5
 * twin (ADR-15 snapshot via `buildStageSnapshotValues`). Empty array is a
 * no-op: a project with no resolved workflow gets zero stages, never a
 * failure (§3.4).
 */
export async function insertProjectStages(
  values: Array<typeof projectStages.$inferInsert>,
  executor: WriteExecutor = db,
): Promise<void> {
  if (values.length === 0) return;
  await executor.insert(projectStages).values(values);
}
