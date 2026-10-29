import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createDepartment,
  listDepartments,
  updateDepartment,
} from '../data/departmentsRepo';
import type { CreateDepartmentInput, ListDepartmentsArgs, PatchDepartmentInput } from '../data/types';

/**
 * The managed department list (design 2026-10-28). One cache root
 * (`['departments']`) so creating/archiving a department refreshes the
 * dropdown, the admin table and every screen that embeds it.
 *
 * Writes invalidate `['users']` too: archiving or re-coding a department
 * changes the labels and codes the directory renders.
 */
export const DEPARTMENTS_KEY = ['departments'] as const;

export function useDepartments(args: ListDepartmentsArgs = {}) {
  return useQuery({
    queryKey: [...DEPARTMENTS_KEY, args],
    queryFn: () => listDepartments(args),
    staleTime: 60_000,
  });
}

function useInvalidateDepartments() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: DEPARTMENTS_KEY });
    void client.invalidateQueries({ queryKey: ['users'] });
  };
}

export function useCreateDepartment() {
  const invalidate = useInvalidateDepartments();
  return useMutation({
    mutationFn: (input: CreateDepartmentInput) => createDepartment(input),
    onSuccess: invalidate,
  });
}

export function useUpdateDepartment() {
  const invalidate = useInvalidateDepartments();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PatchDepartmentInput }) =>
      updateDepartment(id, input),
    onSuccess: invalidate,
  });
}
