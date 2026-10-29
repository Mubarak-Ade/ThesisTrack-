import type { DepartmentRow } from './repository.js';

export type { DepartmentRow };

/**
 * The API shape of a department (design §5). `activeWorkflow` is the single
 * active workflow holding the FR-CW-08 slot — the administrator screen shows
 * it, and its presence is why an archive request can be refused with 409.
 * `studentCount` is the attached-student total, shown in the same table.
 */
export interface DepartmentView {
  id: string;
  name: string;
  /** `DEPT` in a student registration number; NULL only for legacy rows. */
  code: string | null;
  archived: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  activeWorkflow: { id: string; name: string } | null;
  studentCount: number;
}
