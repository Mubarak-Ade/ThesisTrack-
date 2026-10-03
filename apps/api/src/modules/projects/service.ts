import { db } from '../../config/db.js';
import { ConflictError, ValidationError } from '../../errors/index.js';
import type { AuthUser } from '../../middleware/auth.js';
import { findUserById } from '../users/service.js';
import {
  buildStageSnapshotValues,
  loadWorkflowStages,
  resolveWorkflowForProject,
} from '../workflows/service.js';
import * as repo from './repository.js';
import type {
  CreateProjectInput,
  ListProjectsQuery,
  PatchProjectInput,
} from './schema.js';
import type { ActivityEvent, ProjectListFilters, ProjectListItem, ProjectRow } from './types.js';

/** Business-layer entry point for fetching a project (validates id shape). */
export function getProjectById(id: string): Promise<ProjectRow | undefined> {
  return repo.findProjectById(id);
}

/** Postgres unique_violation — I1's race loser answers with the same 409. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

/* ------------------------------------------------------------------ reads */

/**
 * GET /projects — §11.2's scoped list:
 *
 *   student      → own rows
 *   supervisor   → projects of ACTIVE assignments (§13.3's projectId key)
 *   admin        → all
 *
 * An empty supervisor scope returns an empty page — not 403: holding no
 * assignments is a state, not an access failure.
 */
export async function listProjectsFor(
  user: AuthUser,
  query: ListProjectsQuery,
): Promise<{ projects: ProjectListItem[]; total: number }> {
  const filters: ProjectListFilters = {
    status: query.status,
    q: query.q,
    page: query.page,
    limit: query.limit,
  };

  if (user.role === 'student') {
    filters.studentId = user.id;
  } else if (user.role === 'supervisor') {
    const projectIds = await repo.listActiveAssignedProjectIds(user.id);
    if (projectIds.length === 0) {
      return { projects: [], total: 0 };
    }
    filters.projectIds = projectIds;
  }

  const { rows, total } = await repo.listProjects(filters);
  return { projects: rows, total };
}

/* ----------------------------------------------------------------- writes */

/**
 * POST /projects — admin manual creation (§11.2), running the SAME ADR-16
 * resolution as approval (§5.9: "two paths, same resolution"):
 *
 *   explicit workflowId → active workflow matching the student's program →
 *   the flagged default → none (zero stages).
 *
 * One transaction: project row, the student's assignment back-fill (without
 * it §13.3's projectId-keyed guard would lock the supervisor out), and the
 * ADR-15 stage snapshot with stage 1 active. Unlike approval, no automatic
 * stage advancement runs — §5.9 grants that only to a transaction that IS an
 * approval.
 */
export async function createProject(actorId: string, input: CreateProjectInput): Promise<ProjectRow> {
  const student = await findUserById(input.studentId);
  if (!student || student.role !== 'student') {
    throw new ValidationError('Invalid student', [
      { path: 'studentId', message: 'Student not found' },
    ]);
  }

  const existing = await repo.findActiveProjectForStudent(input.studentId);
  if (existing) {
    throw new ConflictError('This student already has an active project');
  }

  // Explicit id (branch 1) is validated inside; an unknown one is a 400 on
  // `workflowId` — the §5.4 templateId discipline (§3.4: approval never fails
  // on workflow data, but an explicit bad id is still a request error).
  const workflow = await resolveWorkflowForProject(input.workflowId, student.program);
  const stages = workflow ? await loadWorkflowStages(workflow.id) : [];

  try {
    return await db.transaction(async (tx) => {
      const project = await repo.insertProject(
        {
          studentId: input.studentId,
          title: input.title,
          description: input.description,
          status: 'active',
          workflowId: workflow?.id ?? null,
        },
        tx,
      );

      await repo.backfillActiveAssignmentProject(input.studentId, project.id, tx);
      await repo.insertProjectStages(
        buildStageSnapshotValues(stages, project.id, actorId),
        tx,
      );
      return project;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError('This student already has an active project');
    }
    throw err;
  }
}

/** PATCH /projects/:projectId — admin metadata/status edit (§11.2). */
export async function patchProject(
  project: ProjectRow,
  input: PatchProjectInput,
): Promise<ProjectRow> {
  const updated = await repo.updateProject(project.id, input);
  return updated ?? project; // guard already loaded it; a concurrent delete keeps the snapshot
}

/* ------------------------------------------------------- activity feed (§11.13) */

const decisionText = (decision: string): string => decision.replace(/_/g, ' ');

/**
 * GET /projects/:projectId/activity — the derived, read-only, chronologically
 * merged feed (§11.13). Nine queries over existing rows, merged and sorted
 * newest-first, capped at 100 entries (MVP volume, §11.13's own words).
 * The two `stage.*` kinds are FR-CW-07's history channel — there is no event
 * table (§8.12, ADR-15).
 */
export async function getActivityFeed(projectId: string): Promise<ActivityEvent[]> {
  const [
    submittedProposals,
    proposalReviews,
    assignmentChanges,
    completedMilestones,
    submissions,
    submissionReviews,
    feedbackRows,
    stageTransitions,
  ] = await Promise.all([
    repo.listSubmittedProposals(projectId),
    repo.listProposalReviews(projectId),
    repo.listAssignmentChanges(projectId),
    repo.listCompletedMilestones(projectId),
    repo.listSubmissions(projectId),
    repo.listSubmissionReviews(projectId),
    repo.listFeedback(projectId),
    repo.listStageTransitions(projectId),
  ]);

  const events: Array<Omit<ActivityEvent, 'actor'> & { actorId: string | null }> = [];

  for (const row of submittedProposals) {
    if (!row.at) continue;
    events.push({
      id: `proposal.submitted:${row.id}`,
      at: row.at,
      kind: 'proposal.submitted',
      actorId: row.studentId,
      summary: `Proposal "${row.title}" submitted`,
    });
  }
  for (const row of proposalReviews) {
    events.push({
      id: `proposal.reviewed:${row.id}`,
      at: row.at,
      kind: 'proposal.reviewed',
      actorId: row.reviewerId,
      summary: `Proposal ${decisionText(row.decision)}`,
    });
  }
  for (const row of assignmentChanges) {
    events.push({
      id: `assignment.changed:${row.id}`,
      at: row.assignedAt,
      kind: 'assignment.changed',
      actorId: row.assignedBy,
      summary: 'Supervisor assigned',
    });
    if (row.endedAt) {
      events.push({
        id: `assignment.changed:${row.id}:ended`,
        at: row.endedAt,
        kind: 'assignment.changed',
        actorId: null, // assignments record who assigned, not who ended
        summary: 'Supervisor assignment ended',
      });
    }
  }
  for (const row of completedMilestones) {
    if (!row.at) continue;
    events.push({
      id: `milestone.completed:${row.id}`,
      at: row.at,
      kind: 'milestone.completed',
      actorId: null, // milestones have no completed_by column
      summary: `Milestone "${row.title}" completed`,
    });
  }
  for (const row of submissions) {
    events.push({
      id: `submission.created:${row.id}`,
      at: row.at,
      kind: 'submission.created',
      actorId: row.submittedBy,
      summary: `Submission "${row.title}" created`,
    });
  }
  for (const row of submissionReviews) {
    events.push({
      id: `submission.reviewed:${row.id}`,
      at: row.at,
      kind: 'submission.reviewed',
      actorId: row.reviewerId,
      summary: `Submission ${decisionText(row.decision)}`,
    });
  }
  for (const row of feedbackRows) {
    events.push({
      id: `feedback.created:${row.id}`,
      at: row.at,
      kind: 'feedback.created',
      actorId: row.authorId,
      summary: 'Feedback added',
    });
  }
  for (const row of stageTransitions) {
    if (row.startedAt) {
      events.push({
        id: `stage.started:${row.id}`,
        at: row.startedAt,
        kind: 'stage.started',
        actorId: row.startedBy,
        summary: `Stage "${row.name}" started`,
      });
    }
    if (row.completedAt) {
      events.push({
        id: `stage.completed:${row.id}`,
        at: row.completedAt,
        kind: 'stage.completed',
        actorId: row.completedBy,
        summary: `Stage "${row.name}" completed`,
      });
    }
  }

  // One name lookup for every actor, then merge: newest first, capped.
  const names = await repo.findActorNames(events.map((event) => event.actorId!).filter(Boolean));

  events.sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id));

  return events.slice(0, 100).map((event) => ({
    id: event.id,
    at: event.at,
    kind: event.kind,
    actor: event.actorId
      ? { id: event.actorId, name: names.get(event.actorId) ?? 'Unknown user' }
      : null,
    summary: event.summary,
  }));
}
