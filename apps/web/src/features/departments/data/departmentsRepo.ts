/**
 * Managed department repository (design 2026-10-28 — PROPOSED ADR-11
 * reversal). Writes always surface errors (Rule 3: never fake success).
 *
 * The list is read by every authenticated account (the user form, the workflow
 * builder and the profile need it); only an administrator may write.
 */
import { api } from '@/lib/api/http';
import { mapDepartmentDetail, mapDepartmentsPage } from './mappers';
import type {
  CreateDepartmentInput,
  Department,
  DepartmentsPage,
  ListDepartmentsArgs,
  PatchDepartmentInput,
} from './types';

function listQuery(args: ListDepartmentsArgs): string {
  const params = new URLSearchParams({
    page: String(args.page ?? 1),
    limit: String(args.limit ?? 100),
  });
  // The API parses these as the strings 'true'/'false' — never booleans.
  if (args.includeArchived) params.set('includeArchived', 'true');
  if (args.missingCode) params.set('missingCode', 'true');
  return params.toString();
}

export async function listDepartments(args: ListDepartmentsArgs = {}): Promise<DepartmentsPage> {
  const payload = await api.get<unknown>(`/departments?${listQuery(args)}`);
  return mapDepartmentsPage(payload);
}

export async function getDepartment(id: string): Promise<Department> {
  return mapDepartmentDetail(await api.get<unknown>(`/departments/${id}`));
}

export async function createDepartment(input: CreateDepartmentInput): Promise<Department> {
  return mapDepartmentDetail(await api.post<unknown>('/departments', input));
}

export async function updateDepartment(
  id: string,
  input: PatchDepartmentInput,
): Promise<Department> {
  return mapDepartmentDetail(await api.patch<unknown>(`/departments/${id}`, input));
}
