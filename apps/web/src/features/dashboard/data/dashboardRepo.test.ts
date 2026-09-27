import { describe, expect, it } from 'vitest';

import { getDashboard } from './dashboardRepo';

describe('getDashboard', () => {
  it('returns the mockup DashboardData payload (spec §5.1)', async () => {
    const data = await getDashboard();

    expect(data.project).toMatchObject({ total: 86, active: 71, completed: 9, atRisk: 6 });
    expect(data.department).toMatchObject({ students: 120, assigned: 112, unassigned: 8 });
    expect(data.department.assigned + data.department.unassigned).toBe(data.department.students);
    expect(data.workspaceTotal).toBe(212);
    expect(data.workspace).toHaveLength(5);
    expect(data.tasks.upcoming.length).toBeGreaterThan(0);
    expect(data.tasks.action.length).toBeGreaterThan(0);
    expect(data.tasks.overdue).toHaveLength(1);
    expect(data.tasks.critical.cta).toBe('Assign Faculty Now →');
    expect(data.activity).toHaveLength(3);
    expect(data.quickActions).toHaveLength(4);
  });

  it('uses only known workspace statuses (badge map stays exhaustive)', async () => {
    const { workspace } = await getDashboard();
    const allowed = ['IN PROGRESS', 'PENDING REVIEW', 'DELAYED', 'COMPLETED'];
    for (const row of workspace) {
      expect(allowed).toContain(row.status);
    }
  });

  it('quick actions each declare exactly one destination', async () => {
    const { quickActions } = await getDashboard();
    for (const action of quickActions) {
      expect(Number(Boolean(action.to)) + Number(Boolean(action.csv))).toBe(1);
    }
  });
});
