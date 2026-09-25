/** Coordinator Dashboard sample data (spec §4 — no dashboard endpoint). */
import type { DashboardData } from '../types';

export const DASHBOARD_FIXTURES: DashboardData = {
  project: { total: 142, active: 98, completed: 31, atRisk: 13 },
  department: { students: 842, assigned: 779, unassigned: 63 },
  workspace: [
    {
      student: 'Marcus Holloway',
      code: 'USR-9012',
      project: 'Neural Network Optimization for Edge Devices',
      phase: 'Literature Review',
      status: 'IN PROGRESS',
      supervisor: 'Dr. Elena Rossi',
      updated: '2 hours ago',
    },
    {
      student: 'Anita Desai',
      code: 'USR-1102',
      project: 'Blockchain-based Academic Credential Verification',
      phase: 'Proposal Defence',
      status: 'PENDING REVIEW',
      supervisor: 'Prof. Thomas Miller',
      updated: '1 day ago',
    },
    {
      student: 'Robert Chen',
      code: 'USR-5589',
      project: 'Generative AI for Parametric Architectural Floor Plans',
      phase: 'Data Collection',
      status: 'DELAYED',
      supervisor: 'Dr. Alistair Vance',
      updated: '4 days ago',
    },
    {
      student: 'Liam O\u2019Connor',
      code: 'USR-1142',
      project: 'IoT-enabled Smart Campus Energy Monitoring',
      phase: 'Methodology',
      status: 'IN PROGRESS',
      supervisor: 'Prof. Amara Okafor',
      updated: '6 hours ago',
    },
    {
      student: 'Yuki Tanaka',
      code: 'USR-7050',
      project: 'Federated Learning for Privacy-Preserving Student Analytics',
      phase: 'Final Review',
      status: 'COMPLETED',
      supervisor: 'Prof. Sarah Blake',
      updated: '1 week ago',
    },
  ],
  tasks: {
    upcoming: [
      { kind: 'UPCOMING', title: 'Mid-semester progress reports due', due: 'Due in 3 days' },
      { kind: 'UPCOMING', title: 'Supervisor allocation window opens', due: 'Due Oct 30' },
    ],
    action: [
      { kind: 'ACTION REQUIRED', title: 'Verify 4 pending account requests', due: 'Today' },
      { kind: 'ACTION REQUIRED', title: 'Approve proposal: Liam O\u2019Connor', due: 'Due tomorrow' },
    ],
    overdue: [
      { kind: 'OVERDUE', title: 'Chapter Two reviews outstanding', due: 'Overdue by 2 days' },
      { kind: 'OVERDUE', title: 'Unassigned students need supervisors', due: 'Overdue by 5 days' },
    ],
    critical: {
      title: '3 theses at risk this week',
      bodyLead: 'Missing',
      dateEm: 'Oct 28',
      bodyTail: 'milestone for TH-2024-001, TH-2024-014, TH-2023-089. Students notified automatically.',
      cta: 'Review now',
    },
  },
  activity: [
    { iconKind: 'feedback', before: 'Supervisor submitted feedback for ', strong: 'Chapter One', when: '2 HOURS AGO' },
    { iconKind: 'proposal', strong: 'Proposal approved', when: 'YESTERDAY' },
    {
      iconKind: 'milestone',
      before: 'Milestone completed: ',
      strong: 'Literature Review',
      when: '2 DAYS AGO',
    },
  ],
};
