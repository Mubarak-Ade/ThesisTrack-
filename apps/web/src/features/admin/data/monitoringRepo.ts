/**
 * Monitoring repository (spec §4.6 guardrail): **read-only**, consuming only
 * the surfaces §4.5 already grants — `GET /projects`, `GET /projects/:id/
 * activity` (with `stage.*` kinds, §11.13) and `GET /projects/:id/stages`.
 * No monitoring writes exist, and none are created here.
 *
 * Fan-out is bounded: one page of projects, then one tracker + one activity
 * read per row (demo-scale oversight, no new aggregate endpoint — §4.6).
 * LIVE-ONLY: fabricated oversight data is the one thing a monitoring screen
 * must never show.
 */
import { api } from '@/lib/api/http';
import { countProjectsByStatus } from './projectsRepo';
import {
  mapActivityFeed,
  mapCurrentStage,
  mapPaged,
  mapProjectRow,
} from './mappers';
import type {
  ActivityItem,
  AdminProjectRow,
  MonitoringProjectRow,
  MonitoringSummary,
} from './types';

/** Rows per monitoring page — also bounds the per-row fan-out. */
const PAGE_LIMIT = 8;
/** Merged feed cap (newest first after sort). */
const FEED_CAP = 12;
/** Activity kinds §4.6 names for this screen. */
const STAGE_KINDS = new Set(['stage.started', 'stage.completed']);

async function readProjectRow(projectId: string): Promise<{
  stage: { name: string; position: number } | null;
  activity: ActivityItem[];
}> {
  const [stages, activity] = await Promise.all([
    api.get<unknown>(`/projects/${projectId}/stages`),
    api.get<unknown>(`/projects/${projectId}/activity`),
  ]);
  return { stage: mapCurrentStage(stages), activity: mapActivityFeed(activity) };
}

export async function getMonitoring(): Promise<MonitoringSummary> {
  const [counts, page] = await Promise.all([
    countProjectsByStatus(),
    // One page — admin scope is "all projects" (§4.5), newest first from the API.
    mapPaged<AdminProjectRow>(
      await api.get<unknown>(`/projects?page=1&limit=${PAGE_LIMIT}`),
      'projects',
      mapProjectRow,
    ),
  ]);

  // One tracker + one activity read per row (bounded fan-out).
  const perProject = await Promise.all(
    page.items.map(async (project) => ({
      project,
      detail: await readProjectRow(project.id),
    })),
  );

  const rows: MonitoringProjectRow[] = perProject.map(({ project, detail }) => ({
    id: project.id,
    title: project.title,
    studentName: project.studentName,
    status: project.status,
    currentStage: detail.stage?.name ?? null,
    currentStagePosition: detail.stage?.position ?? null,
  }));

  const feed: ActivityItem[] = [];
  for (const { detail } of perProject) {
    for (const item of detail.activity) {
      if (STAGE_KINDS.has(item.kind)) feed.push(item);
    }
  }
  feed.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  return {
    counts,
    projects: rows,
    feed: feed.slice(0, FEED_CAP),
  };
}
