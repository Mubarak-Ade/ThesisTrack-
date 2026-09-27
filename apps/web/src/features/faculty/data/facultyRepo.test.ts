import { describe, expect, it } from 'vitest';

import { getFaculty } from './facultyRepo';

describe('getFaculty', () => {
  it('serves the full mockup snapshot (spec §5.5)', async () => {
    const snap = await getFaculty();
    expect(snap.rows).toHaveLength(8); // page 1 = 5 rows, page 2 = 3 rows
    expect(snap.stats.total).toBe(42);
    expect(snap.stats.students).toBe(212);
    expect(snap.stats.avgLoad).toBe(5.2);
    expect(snap.stats.pending).toBe(14);
    expect(snap.alerts).toHaveLength(2);
    expect(snap.systemNotice).toContain('Fall Allocation');
  });

  it('distribution adds up to the advertised supervisor total', async () => {
    const snap = await getFaculty();
    const sum = snap.distribution.reduce((n, d) => n + d.supervisors, 0);
    expect(sum).toBe(snap.stats.total);
  });

  it('every admin tool declares exactly one action', async () => {
    const snap = await getFaculty();
    expect(snap.adminTools).toHaveLength(3);
    for (const tool of snap.adminTools) {
      expect(Number(Boolean(tool.to)) + Number(Boolean(tool.toast))).toBe(1);
    }
    expect(snap.adminTools[0]?.to).toBe('/users/import');
  });
});
