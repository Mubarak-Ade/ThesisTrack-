/**
 * Advisory similar-project rows for a proposal (ADR-18).
 *
 * The API returns the same whitelisted library projection as
 * `GET /project-library`, but this feature owns only the fields it renders.
 * A mapper that cannot name a field cannot leak it — there is deliberately no
 * `email`, `body`, attachment or proposal field here.
 */
import { api } from '@/lib/api/http';

export type SimilarProjectStatus = 'active' | 'completed' | 'archived';

export interface SimilarProjectPerson {
  firstName: string;
  lastName: string;
}

export interface SimilarProject {
  id: string;
  title: string;
  status: SimilarProjectStatus;
  session: string | null;
  student: SimilarProjectPerson;
  department: { name: string } | null;
  excerpt: string | null;
  score: number | null;
}

const STATUSES: readonly string[] = ['active', 'completed', 'archived'];

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableStr(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function mapPerson(value: unknown): SimilarProjectPerson {
  const r = asRecord(value);
  return { firstName: str(r.firstName), lastName: str(r.lastName) };
}

/** Row → SimilarProject; a malformed row is dropped rather than half-rendered. */
export function mapSimilarProject(value: unknown): SimilarProject | null {
  const r = asRecord(value);
  const status =
    typeof r.status === 'string' && STATUSES.includes(r.status)
      ? (r.status as SimilarProjectStatus)
      : null;
  if (typeof r.id !== 'string' || typeof r.title !== 'string' || !status) return null;

  const department = asRecord(r.department);

  return {
    id: r.id,
    title: r.title,
    status,
    session: nullableStr(r.session),
    student: mapPerson(r.student),
    department:
      typeof department.name === 'string' ? { name: department.name } : null,
    excerpt: nullableStr(r.excerpt),
    score: typeof r.score === 'number' ? r.score : null,
  };
}

/** `{matches}` → rows; an absent list is an empty result, not an error. */
export function mapSimilarProjects(payload: unknown): SimilarProject[] {
  const r = asRecord(payload);
  if (!Array.isArray(r.matches)) return [];
  return r.matches
    .map(mapSimilarProject)
    .filter((row): row is SimilarProject => row !== null);
}

export async function listSimilarForProposal(proposalId: string): Promise<SimilarProject[]> {
  const payload = await api.get<unknown>(`/proposals/${proposalId}/similar-projects`);
  return mapSimilarProjects(payload);
}
