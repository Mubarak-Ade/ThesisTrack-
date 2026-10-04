/**
 * Student dashboard repository (§16.2, §10.4) — task 11.1's read layer.
 *
 * Three primary reads decide the state (supervisor, proposals, projects);
 * the reviewer comment (States 3/4) and the milestone facts (State 5) are
 * *extras*: each is best-effort, so a failing extra degrades that one card
 * instead of blanking the dashboard. Primary failure falls back to a fixture
 * scenario with `usedFallback` (SampleDataBanner); writes do not exist here.
 */
import { api } from '@/lib/api/http';
import type { MilestoneRef } from '@/lib/domain/progress';
import {
  PROPOSAL_STATUSES,
  resolveStudentState,
  type ProposalRef,
  type ProposalStatus,
  type ProjectRef,
  type StudentStateResult,
  type SupervisorRef,
} from '../lib/studentState';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asStatus(value: unknown): ProposalStatus | null {
  return typeof value === 'string' && (PROPOSAL_STATUSES as readonly string[]).includes(value)
    ? (value as ProposalStatus)
    : null;
}

function mapProposal(value: unknown): ProposalRef | null {
  const r = asRecord(value);
  const status = asStatus(r.status);
  if (typeof r.id !== 'string' || !status) return null;
  return {
    id: r.id,
    title: str(r.title, 'Untitled proposal'),
    status,
    updatedAt: str(r.updatedAt),
  };
}

function mapProject(value: unknown): ProjectRef | null {
  const r = asRecord(value);
  if (typeof r.id !== 'string') return null;
  return { id: r.id, title: str(r.title, 'Untitled project'), status: str(r.status, 'active') };
}

function mapSupervisor(value: unknown): SupervisorRef | null {
  const r = asRecord(value);
  if (typeof r.firstName !== 'string' || typeof r.lastName !== 'string') return null;
  return {
    firstName: r.firstName,
    lastName: r.lastName,
    email: str(r.email),
  };
}

function mapMilestone(value: unknown): MilestoneRef | null {
  const r = asRecord(value);
  if (typeof r.id !== 'string') return null;
  const status = str(r.state ?? r.status, 'pending');
  const known = ['pending', 'in_progress', 'submitted', 'approved', 'overdue'];
  return {
    id: r.id,
    title: str(r.title, 'Milestone'),
    status: (known.includes(status) ? status : 'pending') as MilestoneRef['status'],
    dueAt: typeof r.dueAt === 'string' ? r.dueAt : null,
    position: typeof r.position === 'number' ? r.position : 0,
  };
}

/** Latest review comment — States 3/4 quote the reviewer verbatim (§16.2). */
async function loadLatestReviewComment(proposalId: string): Promise<string | null> {
  try {
    const payload = await api.get<{ reviews?: unknown }>(`/proposals/${proposalId}/reviews`);
    const reviews = Array.isArray(payload?.reviews) ? payload.reviews : [];
    const newest = reviews[0];
    const comment = asRecord(newest).comment;
    return typeof comment === 'string' && comment.trim().length > 0 ? comment : null;
  } catch {
    return null;
  }
}

async function loadMilestones(projectId: string): Promise<MilestoneRef[]> {
  try {
    const payload = await api.get<{ milestones?: unknown }>(`/projects/${projectId}/milestones`);
    if (!Array.isArray(payload?.milestones)) return [];
    return payload.milestones
      .map(mapMilestone)
      .filter((row): row is MilestoneRef => row !== null);
  } catch {
    return [];
  }
}

/** §16.2 State 0/1 fixture — one sample scenario behind the banner. */
const FALLBACK = {
  hasActiveSupervisor: true,
  supervisor: { firstName: 'Helen', lastName: 'Brooks', email: 'h.brooks@university.edu' },
  proposals: [] as ProposalRef[],
  projects: [] as ProjectRef[],
};

export interface StudentDashboard {
  state: StudentStateResult;
  /** Latest reviewer comment for States 3/4, else null. */
  reviewComment: string | null;
  /** State 5 milestone rows (empty elsewhere / on failure). */
  milestones: MilestoneRef[];
  usedFallback: boolean;
}

export async function getStudentDashboard(userId: string): Promise<StudentDashboard> {
  let hasActiveSupervisor = false;
  let supervisor: SupervisorRef | null = null;
  let proposals: ProposalRef[] = [];
  let projects: ProjectRef[] = [];
  let usedFallback = false;

  try {
    const [assignmentPayload, proposalsPayload, projectsPayload] = await Promise.all([
      api.get<{ active?: unknown }>(`/students/${userId}/supervisor`),
      api.get<{ proposals?: unknown }>('/proposals?page=1&limit=50'),
      api.get<{ projects?: unknown }>('/projects?page=1&limit=50'),
    ]);

    const active = assignmentPayload?.active;
    hasActiveSupervisor = active !== null && active !== undefined;
    supervisor = hasActiveSupervisor
      ? mapSupervisor(asRecord(active).supervisor)
      : null;

    if (!Array.isArray(proposalsPayload?.proposals)) {
      throw new Error('proposals envelope missing');
    }
    if (!Array.isArray(projectsPayload?.projects)) {
      throw new Error('projects envelope missing');
    }
    proposals = proposalsPayload.proposals
      .map(mapProposal)
      .filter((row): row is ProposalRef => row !== null);
    projects = projectsPayload.projects
      .map(mapProject)
      .filter((row): row is ProjectRef => row !== null);
  } catch (error) {
    console.warn('[studentDashboardRepo]: using sample data —', error);
    hasActiveSupervisor = FALLBACK.hasActiveSupervisor;
    supervisor = FALLBACK.supervisor;
    proposals = FALLBACK.proposals;
    projects = FALLBACK.projects;
    usedFallback = true;
  }

  const state = resolveStudentState({ hasActiveSupervisor, supervisor, proposals, projects });

  const reviewComment =
    (state.state === 3 || state.state === 4) && state.proposal
      ? await loadLatestReviewComment(state.proposal.id)
      : null;

  const milestones = state.state === 5 && state.project ? await loadMilestones(state.project.id) : [];

  return { state, reviewComment, milestones, usedFallback };
}
