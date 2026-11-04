/**
 * §10.4 — TanStack Query for every fetch/mutation; plain `useEffect`
 * fetching in new code is REJECTED. Query roots: `['admin', …]` so one
 * `invalidateQueries({queryKey:['admin']})` refreshes the whole oversight
 * surface after a write.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  assignSupervisor,
  buildReport,
  changeSupervisor,
  countProjectsByStatus,
  createWorkflow,
  deleteWorkflow,
  duplicateWorkflow,
  endSupervisor,
  getMonitoring,
  getReportCounts,
  getStudentAssignment,
  getWorkflow,
  listProjects,
  listStudents,
  listSupervisors,
  listWorkflows,
  patchWorkflow,
  setProjectStatus,
} from './data';
import type {
  CreateWorkflowInput,
  DirectoryPageArgs,
  DuplicateWorkflowInput,
  DuplicateWorkflowResult,
  PatchWorkflowInput,
  ProjectStatus,
  ProjectsPageArgs,
  ReportKey,
  WorkflowDetail,
  WorkflowsPageArgs,
} from './data';

/* ----------------------------------------------------------------- Projects */

export function useProjects(args: ProjectsPageArgs) {
  return useQuery({
    queryKey: ['admin', 'projects', args.page, args.limit, args.status ?? 'all', args.q ?? ''],
    queryFn: () => listProjects(args),
    staleTime: 10_000,
  });
}

export function useProjectCounts() {
  return useQuery({
    queryKey: ['admin', 'projectCounts'],
    queryFn: countProjectsByStatus,
    staleTime: 30_000,
  });
}

/** Flow H (§5.8) — archive/restore; one invalidation refreshes every view. */
export function useSetProjectStatus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, status }: { projectId: string; status: ProjectStatus }) =>
      setProjectStatus(projectId, status),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['admin'] }),
  });
}

/* -------------------------------------------------------------- Assignments */

export function useStudents(args: DirectoryPageArgs) {
  return useQuery({
    queryKey: [
      'admin',
      'students',
      args.page,
      args.limit,
      args.q ?? '',
      args.departmentId ?? 'all',
    ],
    queryFn: () => listStudents(args),
    staleTime: 10_000,
  });
}

export function useSupervisors(args: Pick<DirectoryPageArgs, 'limit' | 'departmentId'>) {
  return useQuery({
    queryKey: ['admin', 'supervisors', args.limit, args.departmentId ?? 'all'],
    queryFn: () => listSupervisors({ page: 1, limit: args.limit, departmentId: args.departmentId }),
    staleTime: 60_000,
  });
}

export function useStudentAssignment(studentId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['admin', 'assignment', studentId],
    queryFn: () => {
      if (!studentId) throw new Error('missing student id');
      return getStudentAssignment(studentId);
    },
    enabled: !!studentId && enabled,
    staleTime: 10_000,
  });
}

/** Flow C writes (§5.3) — POST/PATCH/DELETE, errors surface to the dialog. */
export function useAssignmentWrite() {
  const client = useQueryClient();
  const done = () => {
    void client.invalidateQueries({ queryKey: ['admin'] });
    void client.invalidateQueries({ queryKey: ['monitoring'] });
  };
  return useMutation({
    mutationFn: ({
      studentId,
      action,
      supervisorId,
    }: {
      studentId: string;
      action: 'assign' | 'change' | 'end';
      supervisorId?: string;
    }) => {
      if (action === 'assign') return assignSupervisor(studentId, supervisorId!);
      if (action === 'change') return changeSupervisor(studentId, supervisorId!);
      return endSupervisor(studentId);
    },
    onSuccess: done,
  });
}

/* --------------------------------------------------------------- Workflows */

export function useWorkflows(args: WorkflowsPageArgs) {
  return useQuery({
    queryKey: [
      'admin',
      'workflows',
      args.page,
      args.limit,
      args.departmentId ?? '',
      args.includeArchived ? 'all' : 'active',
    ],
    queryFn: () => listWorkflows(args),
    staleTime: 10_000,
  });
}

export function useWorkflow(workflowId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'workflow', workflowId],
    queryFn: () => {
      if (!workflowId) throw new Error('missing workflow id');
      return getWorkflow(workflowId);
    },
    enabled: !!workflowId,
    staleTime: 10_000,
  });
}

/** Whole-set writes (FR-CW-01…03 + §16.3 set-default) — one invalidation. */
export function useWorkflowWrite() {
  const client = useQueryClient();
  const done = () => void client.invalidateQueries({ queryKey: ['admin'] });
  return useMutation<WorkflowDetail | DuplicateWorkflowResult | void, Error, {
    action: 'create' | 'patch' | 'delete' | 'duplicate';
    workflowId?: string;
    input?: PatchWorkflowInput | CreateWorkflowInput | DuplicateWorkflowInput;
  }>({
    mutationFn: async ({ action, workflowId, input }) => {
      if (action === 'create') return createWorkflow(input as CreateWorkflowInput);
      if (action === 'patch') return patchWorkflow(workflowId!, input as PatchWorkflowInput);
      if (action === 'duplicate') {
        return duplicateWorkflow(workflowId!, input as DuplicateWorkflowInput);
      }
      return deleteWorkflow(workflowId!);
    },
    onSuccess: done,
  });
}

/* --------------------------------------------------- Monitoring & Reports */

export function useMonitoring() {
  return useQuery({
    queryKey: ['monitoring'],
    queryFn: getMonitoring,
    staleTime: 15_000,
  });
}

export function useReportCounts() {
  return useQuery({
    queryKey: ['admin', 'reportCounts'],
    queryFn: getReportCounts,
    staleTime: 30_000,
  });
}

export function useBuildReport() {
  return useMutation({ mutationFn: (key: ReportKey) => buildReport(key) });
}
