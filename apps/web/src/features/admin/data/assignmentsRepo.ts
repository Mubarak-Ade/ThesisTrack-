/**
 * Administrator Assignments repository — Flow C (§5.3, §11.1).
 *
 * The screen fans out the student-scoped endpoints exactly as plan 13.1
 * specifies: a `GET /users?role=student` page, then one
 * `GET /students/:id/supervisor` per visible student (admin is permitted by
 * §4.5). Writes are POST/PATCH/DELETE on the student-scoped path — the only
 * way to reach a student who has no project yet (ADR-13, §8.2).
 *
 * LIVE-ONLY: assigning a supervisor to a fixture row cannot succeed, and
 * Rule 3 forbids pretending otherwise.
 */
import { api } from '@/lib/api/http';
import { mapPaged, mapStudentAssignment, mapStudentRow, mapSupervisorRow } from './mappers';
import type {
  DirectoryPage,
  DirectoryPageArgs,
  DirectoryStudent,
  DirectorySupervisor,
  StudentAssignment,
} from './types';

/** Students directory page — `GET /users?role=student` (§11.0.2). */
export async function listStudents(args: DirectoryPageArgs): Promise<DirectoryPage<DirectoryStudent>> {
  const params = new URLSearchParams({
    page: String(args.page),
    limit: String(args.limit),
    role: 'student',
  });
  const q = args.q?.trim();
  if (q) params.set('q', q);
  const page = mapPaged<DirectoryStudent>(
    await api.get<unknown>(`/users?${params}`),
    'users',
    mapStudentRow,
  );
  return { items: page.items, total: page.total, page: page.page, limit: page.limit };
}

/** Supervisor picker + Faculty view — `GET /users?role=supervisor`. */
export async function listSupervisors(
  args: DirectoryPageArgs,
): Promise<DirectoryPage<DirectorySupervisor>> {
  const params = new URLSearchParams({
    page: String(args.page),
    limit: String(args.limit),
    role: 'supervisor',
  });
  const q = args.q?.trim();
  if (q) params.set('q', q);
  const page = mapPaged<DirectorySupervisor>(
    await api.get<unknown>(`/users?${params}`),
    'users',
    mapSupervisorRow,
  );
  return { items: page.items, total: page.total, page: page.page, limit: page.limit };
}

/** GET /students/:studentId/supervisor → active relationship + history (§11.1). */
export async function getStudentAssignment(studentId: string): Promise<StudentAssignment> {
  return mapStudentAssignment(await api.get<unknown>(`/students/${studentId}/supervisor`));
}

/** POST — assign THE supervisor; 409 if this student already has one. */
export async function assignSupervisor(
  studentId: string,
  supervisorId: string,
): Promise<StudentAssignment> {
  await api.post<unknown>(`/students/${studentId}/supervisor`, { supervisorId });
  return getStudentAssignment(studentId);
}

/** PATCH — transactional end-old + insert-new; 422 if already this one. */
export async function changeSupervisor(
  studentId: string,
  supervisorId: string,
): Promise<StudentAssignment> {
  await api.patch<unknown>(`/students/${studentId}/supervisor`, { supervisorId });
  return getStudentAssignment(studentId);
}

/** DELETE — soft end (409 when none active); history is preserved. */
export async function endSupervisor(studentId: string): Promise<StudentAssignment> {
  await api.delete<unknown>(`/students/${studentId}/supervisor`);
  return getStudentAssignment(studentId);
}
