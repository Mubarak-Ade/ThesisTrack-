import { downloadCsv } from '@/lib/csv';
import type { WorkspaceRow } from '../data/types';

/** CSV blob of the workspace rows (spec §5.1 — Export Data). Live rows may omit code/phase/supervisor. */
export function exportWorkspaceCsv(rows: WorkspaceRow[]): void {
  downloadCsv(
    'thesistrack-workspace-report.csv',
    ['Student', 'Code', 'Project', 'Phase', 'Status', 'Supervisor'],
    rows.map((row) => [
      row.student,
      row.code ?? '—',
      row.project,
      row.phase ?? '—',
      row.status,
      row.supervisor ?? '—',
    ]),
  );
}
