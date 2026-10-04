/**
 * Caseload fixtures (§10.4) — answers only on transport/shape failure, always
 * surfaced through `usedFallback` → `SampleDataBanner`. Writes never read them.
 */
import type { CaseloadStudent, SupervisorDashboard } from '../types';

export const CASELOAD_FIXTURES: CaseloadStudent[] = [
  {
    assignmentId: 'asg-1',
    projectId: 'proj-1',
    assignedAt: '2026-09-15T09:00:00.000Z',
    isPrimary: true,
    student: {
      id: 'student-1',
      firstName: 'Ola',
      lastName: 'Nordmann',
      email: 'ola.nordmann@university.edu',
    },
  },
  {
    assignmentId: 'asg-2',
    projectId: null,
    assignedAt: '2026-09-28T14:30:00.000Z',
    isPrimary: false,
    student: {
      id: 'student-2',
      firstName: 'Kari',
      lastName: 'Hansen',
      email: 'kari.hansen@university.edu',
    },
  },
];

export const DASHBOARD_FIXTURE: SupervisorDashboard = {
  students: [
    {
      student: CASELOAD_FIXTURES[0].student,
      projectId: 'proj-1',
      projectTitle: 'Append-only campus ledger',
      stageName: 'Proposal',
    },
    {
      student: CASELOAD_FIXTURES[1].student,
      projectId: null,
      projectTitle: null,
      stageName: null,
    },
  ],
  awaitingProposals: [
    {
      id: 'prop-1',
      title: 'Append-only campus ledger',
      version: 2,
      status: 'submitted',
      student: CASELOAD_FIXTURES[1].student,
      submittedAt: '2026-10-02T10:00:00.000Z',
    },
  ],
  awaitingSubmissions: [
    {
      id: 'sub-1',
      projectId: 'proj-1',
      studentId: 'student-1',
      studentName: 'Ola Nordmann',
      title: 'Chapter 2 — related work',
      submittedAt: '2026-10-03T16:45:00.000Z',
    },
  ],
  deadlines: [
    {
      milestoneId: 'ms-1',
      projectId: 'proj-1',
      studentId: 'student-1',
      studentName: 'Ola Nordmann',
      title: 'Proposal approved',
      dueAt: '2026-10-10T23:59:00.000Z',
      overdue: false,
    },
  ],
  usedFallback: true,
};
