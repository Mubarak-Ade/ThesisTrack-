/**
 * Workflow builder repository (spec §3.4 / §11.14 / §16.3) — list, create,
 * whole-set stage edit (FR-CW-01/02/03), archive, and the §16.3 "set default"
 * affordance (PROPOSED `isDefault` PATCH delta, 2026-10-04).
 *
 * LIVE-ONLY: every row here is a write target (edit/archive/default/delete);
 * fixture rows would fail each mutation with a 404, and Rule 3 keeps those
 * failures on screen instead of hiding them behind sample data.
 */
import { api } from '@/lib/api/http';
import { mapPaged, mapWorkflowDetail, mapWorkflowSummary } from './mappers';
import type {
  CreateWorkflowInput,
  PatchWorkflowInput,
  WorkflowDetail,
  WorkflowSummary,
  WorkflowsPage,
  WorkflowsPageArgs,
} from './types';

export async function listWorkflows(args: WorkflowsPageArgs): Promise<WorkflowsPage> {
  const params = new URLSearchParams({ page: String(args.page), limit: String(args.limit) });
  if (args.program?.trim()) params.set('program', args.program.trim());
  if (args.includeArchived) params.set('includeArchived', 'true');
  const page = mapPaged<WorkflowSummary>(
    await api.get<unknown>(`/workflows?${params}`),
    'workflows',
    mapWorkflowSummary,
  );
  return { items: page.items, total: page.total, page: page.page, limit: page.limit };
}

export async function getWorkflow(workflowId: string): Promise<WorkflowDetail> {
  return mapWorkflowDetail(await api.get<unknown>(`/workflows/${workflowId}`));
}

/** POST /workflows — `isDefault` deliberately absent: creation never steals it. */
export async function createWorkflow(input: CreateWorkflowInput): Promise<WorkflowDetail> {
  return mapWorkflowDetail(await api.post<unknown>('/workflows', input));
}

/** PATCH /workflows/:id — metadata and/or `stages[]` whole-set and/or `isDefault`. */
export async function patchWorkflow(
  workflowId: string,
  input: PatchWorkflowInput,
): Promise<WorkflowDetail> {
  return mapWorkflowDetail(await api.patch<unknown>(`/workflows/${workflowId}`, input));
}

/** DELETE — 422 when projects reference it (§8.11 RESTRICT): archive instead. */
export async function deleteWorkflow(workflowId: string): Promise<void> {
  await api.delete<unknown>(`/workflows/${workflowId}`);
}
