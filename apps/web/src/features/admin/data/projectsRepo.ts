/**
 * Administrator Projects repository (spec §11.2 scoped list, §5.8 archive).
 *
 * LIVE-ONLY: the Projects screen's primary action is `PATCH /projects/:id
 * {status}` (Flow H), and an archive button over a fixture row would 404 on
 * click — Rule 3 (writes never fake success) makes a read-only fixture
 * fallback worse than an honest ErrorState here.
 */
import { api } from '@/lib/api/http';
import { mapPaged, mapProjectRow, mapPagination } from './mappers';
import type { AdminProjectRow, ProjectStatus, ProjectsPage, ProjectsPageArgs } from './types';

function listQuery(args: ProjectsPageArgs): string {
  const params = new URLSearchParams({ page: String(args.page), limit: String(args.limit) });
  if (args.status && args.status !== 'all') params.set('status', args.status);
  const q = args.q?.trim();
  if (q) params.set('q', q);
  return params.toString();
}

export async function listProjects(args: ProjectsPageArgs): Promise<ProjectsPage> {
  const page = mapPaged<AdminProjectRow>(
    await api.get<unknown>(`/projects?${listQuery(args)}`),
    'projects',
    mapProjectRow,
  );
  return { items: page.items, total: page.total, page: page.page, limit: page.limit };
}

/** `?limit=1` probe → exact `pagination.total` without pulling rows. */
async function countProjects(status?: ProjectStatus): Promise<number> {
  const params = new URLSearchParams({ page: '1', limit: '1' });
  if (status) params.set('status', status);
  return mapPagination(await api.get<unknown>(`/projects?${params}`)).total;
}

/** Counter probe bundle for dashboards/monitoring (§11.2 `?status` totals). */
export async function countProjectsByStatus(): Promise<{
  total: number;
  active: number;
  completed: number;
  archived: number;
}> {
  const [total, active, completed, archived] = await Promise.all([
    countProjects(),
    countProjects('active'),
    countProjects('completed'),
    countProjects('archived'),
  ]);
  return { total, active, completed, archived };
}

/** Flow H (§5.8): archive or restore — server-side status values only. */
export async function setProjectStatus(
  projectId: string,
  status: ProjectStatus,
): Promise<AdminProjectRow> {
  const payload = (await api.patch<unknown>(`/projects/${projectId}`, { status })) as unknown;
  return mapProjectRow(
    (payload as Record<string, unknown>).project ?? payload,
  );
}
