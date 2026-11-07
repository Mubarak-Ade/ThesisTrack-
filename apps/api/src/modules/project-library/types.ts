/** Project library read models — design 2026-11-05 (ADR-18). */

export type LibraryStatus = 'active' | 'completed' | 'archived';

/** The only user fields the library exposes: no email, no password, no role. */
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

/**
 * The whitelisted projection returned by every library endpoint. Deliberately
 * not a `ProjectRow`: the endpoint cannot leak the raw row, proposal body,
 * attachments, submissions, reviews, feedback or milestones.
 */
export interface LibraryRow {
  id: string;
  title: string;
  description: string;
  status: LibraryStatus;
  /** `projects.workflow.academicSession`, when the project has a workflow. */
  session: string | null;
  createdAt: Date;
  updatedAt: Date;
  student: LibraryPerson;
  department: LibraryDepartment | null;
  /** Project-linked supervisors, primary first and active before ended. */
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
  /** Exclude a source project from a similar-to query. */
  excludeProjectId?: string;
}

export interface LibraryPage {
  rows: LibraryRow[];
  total: number;
}

export interface DepartmentFacet {
  id: string;
  name: string;
  count: number;
}

export interface SimilarityCheckInput {
  title: string;
  description: string;
  excludeProjectId?: string;
}
