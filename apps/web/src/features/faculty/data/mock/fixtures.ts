import type { FacultySnapshot } from '../types';

/**
 * Stat-card copy — identical for live reads and fixture fallback, so labels
 * and notes never disagree with the numbers' provenance (the banner covers
 * the fallback numbers themselves).
 */
export const FACULTY_STAT_NOTES = {
  total: 'User rows with role supervisor',
  activeSupervisors: 'Supervisor accounts with isActive',
  students: 'User rows with role student',
  pending: 'Proposals with status submitted',
} as const;

/** Mockup values verbatim (spec §5.5) — 8 rows so PREV/NEXT has a real page 2. */
export const FACULTY_FIXTURES: FacultySnapshot = {
  stats: {
    total: 42,
    totalNote: FACULTY_STAT_NOTES.total,
    activeSupervisors: 38,
    activeSupervisorsNote: FACULTY_STAT_NOTES.activeSupervisors,
    students: 212,
    studentsNote: FACULTY_STAT_NOTES.students,
    pending: 14,
    pendingNote: FACULTY_STAT_NOTES.pending,
  },
  rows: [
    {
      name: 'Dr. Elena Rossi',
      code: 'FAC-8821',
      email: 'e.rossi@university.edu',
      program: 'Informatics',
      workloadStudents: 8,
      capacity: 10,
      avgProgress: 72,
      status: 'MAX LOAD',
      lastActivity: '2 hours ago',
    },
    {
      name: 'Prof. Thomas Miller',
      code: 'FAC-4412',
      email: 't.miller@university.edu',
      program: 'Architecture',
      workloadStudents: 5,
      capacity: 10,
      avgProgress: 45,
      status: 'ACTIVE',
      lastActivity: '5 hours ago',
    },
    {
      name: 'Dr. Sarah Blake',
      code: 'FAC-9811',
      email: 's.blake@university.edu',
      program: 'Cyber Security',
      workloadStudents: 3,
      capacity: 10,
      avgProgress: 88,
      status: 'ACTIVE',
      lastActivity: '1 day ago',
    },
    {
      name: 'Dr. Alistair Vance',
      code: 'FAC-1102',
      email: 'a.vance@university.edu',
      program: 'Informatics',
      workloadStudents: 12,
      capacity: 10,
      avgProgress: 65,
      status: 'MAX LOAD',
      lastActivity: 'Just now',
    },
    {
      name: 'Prof. Julianne Moore',
      code: 'FAC-2234',
      email: 'j.moore@university.edu',
      program: 'Philosophy',
      workloadStudents: 0,
      capacity: 10,
      avgProgress: 0,
      status: 'ON LEAVE',
      lastActivity: '2 weeks ago',
    },
    {
      name: 'Prof. Daniel Okafor',
      code: 'FAC-5567',
      email: 'd.okafor@university.edu',
      program: 'Architecture',
      workloadStudents: 4,
      capacity: 10,
      avgProgress: 60,
      status: 'ACTIVE',
      lastActivity: '3 days ago',
    },
    {
      name: 'Dr. Priya Nair',
      code: 'FAC-3345',
      email: 'p.nair@university.edu',
      program: 'Cyber Security',
      workloadStudents: 6,
      capacity: 10,
      avgProgress: 78,
      status: 'ACTIVE',
      lastActivity: 'Yesterday',
    },
    {
      name: 'Prof. Henrik Sorensen',
      code: 'FAC-7789',
      email: 'h.sorensen@university.edu',
      program: 'Philosophy',
      workloadStudents: 7,
      capacity: 10,
      avgProgress: 54,
      status: 'MAX LOAD',
      lastActivity: '4 days ago',
    },
  ],
  total: 8,
  distribution: [
    { program: 'Informatics', supervisors: 12 },
    { program: 'Architecture', supervisors: 8 },
    { program: 'Cyber Security', supervisors: 10 },
    { program: 'Philosophy', supervisors: 12 },
  ],
  alerts: [
    {
      name: 'Dr. Alistair Vance',
      severity: 'danger',
      body: 'Workload exceeded (12/10). Re-allocation of 2 students required immediately.',
    },
    {
      name: 'Dr. Elena Rossi',
      severity: 'warning',
      body: 'Approaching max capacity (8/10). Review allocation for next semester.',
    },
  ],
  systemNotice:
    'The 2024 Fall Allocation window is open. Ensure all faculty supervisors have updated their research interests.',
  adminTools: [
    { label: 'Bulk Assign Students', to: '/users/import' },
    { label: 'Update Faculty Roles', toast: 'Update Faculty Roles is not available yet' },
    { label: 'Communicate All', toast: 'Communicate All is not available yet' },
  ],
  usedFallback: true,
};
