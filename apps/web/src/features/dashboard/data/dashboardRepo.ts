/**
 * Coordinator Dashboard repository (spec §4): the only data import site for
 * the screen. Live first — one parallel probe wave plus a per-project
 * fan-out — with ALL-OR-NOTHING fallback: any transport or contract failure
 * returns the §5.1 fixture snapshot with `usedFallback: true`, which the
 * screen surfaces through `SampleDataBanner` (§10.4).
 */
import { api } from '@/lib/api/http';
import {
  mapActivity,
  mapMilestoneTasks,
  mapProjectList,
  mapProposalTasks,
  mapWorkspaceRow,
  probeTotal,
} from './liveMappers';
import { DASHBOARD_FIXTURES, QUICK_ACTIONS } from './mock/fixtures';
import type { DashboardData } from './types';

/** Rows on the table (mockup shows 5) — drives every per-project fan-out. */
const WORKSPACE_LIMIT = 5;

async function liveDashboard(now: number): Promise<DashboardData> {
  // Wave 1 (~10 requests): the workspace page + every `limit=1` totals probe.
  const [
    listPayload,
    totalPayload,
    activePayload,
    completedPayload,
    archivedPayload,
    studentsPayload,
    facultyPayload,
    submittedPayload,
    underReviewPayload,
    rejectedPayload,
  ] = await Promise.all([
    api.get<unknown>(`/projects?page=1&limit=${WORKSPACE_LIMIT}`),
    api.get<unknown>('/projects?page=1&limit=1'),
    api.get<unknown>('/projects?page=1&limit=1&status=active'),
    api.get<unknown>('/projects?page=1&limit=1&status=completed'),
    api.get<unknown>('/projects?page=1&limit=1&status=archived'),
    api.get<unknown>('/users?role=student&limit=1'),
    api.get<unknown>('/users?role=supervisor&limit=1'),
    api.get<unknown>('/proposals?status=submitted&page=1&limit=1'),
    api.get<unknown>('/proposals?status=under_review&page=1&limit=1'),
    api.get<unknown>('/proposals?status=rejected&page=1&limit=1'),
  ]);

  const projects = mapProjectList(listPayload);
  const workspaceTotal = probeTotal(totalPayload);

  // Wave 2 (4 requests per row): stage · supervisor · activity · milestones.
  const facts = await Promise.all(
    projects.map(async (project) => {
      const [stages, supervisor, activity, milestones] = await Promise.all([
        api.get<unknown>(`/projects/${project.id}/stages`),
        api.get<unknown>(`/projects/${project.id}/supervisor`),
        api.get<unknown>(`/projects/${project.id}/activity`),
        api.get<unknown>(`/projects/${project.id}/milestones`),
      ]);
      return { project, stages, supervisor, activity, milestones };
    }),
  );

  const workspace = facts.map((fact) => mapWorkspaceRow(fact.project, fact.stages, fact.supervisor));
  const { action, critical } = mapProposalTasks({
    submitted: probeTotal(submittedPayload),
    underReview: probeTotal(underReviewPayload),
    rejected: probeTotal(rejectedPayload),
  });
  const { upcoming, overdue } = mapMilestoneTasks(
    facts.map((fact) => ({ payload: fact.milestones, projectTitle: fact.project.title })),
    now,
  );

  return {
    project: {
      total: workspaceTotal,
      active: probeTotal(activePayload),
      completed: probeTotal(completedPayload),
      archived: probeTotal(archivedPayload),
    },
    department: {
      students: probeTotal(studentsPayload),
      faculty: probeTotal(facultyPayload),
      awaiting: probeTotal(submittedPayload),
    },
    workspace,
    workspaceTotal,
    tasks: { upcoming, action, overdue, critical },
    activity: mapActivity(facts.map((fact) => fact.activity)),
    quickActions: QUICK_ACTIONS,
    usedFallback: false,
  };
}

function warn(error: unknown): void {
  console.warn('[dashboardRepo] getDashboard: using sample data —', error);
}

export async function getDashboard(): Promise<DashboardData> {
  try {
    return await liveDashboard(Date.now());
  } catch (error) {
    warn(error);
    return { ...DASHBOARD_FIXTURES, usedFallback: true };
  }
}
