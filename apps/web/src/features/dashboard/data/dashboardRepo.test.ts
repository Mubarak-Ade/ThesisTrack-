import { describe, expect, it } from 'vitest';

import { getDashboard } from './dashboardRepo';

describe('getDashboard', () => {
  it('returns a complete DashboardData payload', async () => {
    const data = await getDashboard();

    expect(data.project).toMatchObject({ total: 142, active: 98, completed: 31, atRisk: 13 });
    expect(data.department.assigned + data.department.unassigned).toBe(data.department.students);
    expect(data.workspace.length).toBeGreaterThanOrEqual(5);
    expect(data.tasks.upcoming.length).toBeGreaterThan(0);
    expect(data.tasks.action.length).toBeGreaterThan(0);
    expect(data.tasks.overdue.length).toBeGreaterThan(0);
    expect(data.tasks.critical.cta).toBe('Review now');
    expect(data.activity).toHaveLength(3);
  });

  it('uses only known workspace statuses (badge map stays exhaustive)', async () => {
    const { workspace } = await getDashboard();
    const allowed = ['IN PROGRESS', 'PENDING REVIEW', 'DELAYED', 'COMPLETED'];
    for (const row of workspace) {
      expect(allowed).toContain(row.status);
    }
  });
});
