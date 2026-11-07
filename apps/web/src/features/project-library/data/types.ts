/**
 * Project library read models — design 2026-11-05 (ADR-18).
 *
 * These mirror the API's whitelisted projection. There is deliberately no
 * `email`, `body`, attachment or proposal field: a mapper that cannot name a
 * field cannot leak it.
 */

export type LibraryStatus = 'active' | 'completed' | 'archived';

export interface LibraryPerson {
  id: string;
  firstName: string;
  lastName: string;
}

export interface LibraryDepartment {
  id: string;
  name: string;
  code: string | null;
}

export interface LibraryRow {
  id: string;
  title: string;
  description: string;
  status: LibraryStatus;
  session: string | null;
  createdAt: string;
  updatedAt: string;
  student: LibraryPerson;
  department: LibraryDepartment | null;
  supervisors: LibraryPerson[];
  /** Present on search/similar results; `null` for a plain list/detail read. */
  score: number | null;
  /** Plain-text snippet; never HTML and never the full proposal body. */
  excerpt: string | null;
}

export interface LibraryFilters {
  q?: string;
  status: LibraryStatus | 'all';
  departmentId?: string;
  page: number;
  limit: number;
}

export interface DepartmentFacet {
  id: string;
  name: string;
  count: number;
}

export interface LibraryPage {
  items: LibraryRow[];
  total: number;
  page: number;
  limit: number;
  departments: DepartmentFacet[];
}

export interface LibraryDetail {
  project: LibraryRow;
  similar: LibraryRow[];
}

export type SimilarMatch = LibraryRow;

export interface SimilarityCheckInput {
  title: string;
  description: string;
  excludeProjectId?: string;
}
