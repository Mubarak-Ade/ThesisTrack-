/** Coordinator Dashboard sample data (spec §5.1 — fallback behind SampleDataBanner). Mockup values are binding. */
import type { DashboardData, QuickAction } from '../types';

/**
 * Quick-action tiles are static configuration shared verbatim by the live
 * and fallback paths — routes point at screens that exist (§16.3), never
 * placeholders.
 */
export const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Add User', hint: 'Enroll student/faculty', to: '/users/new' },
  { label: 'Assign Students', hint: 'Link students to mentors', to: '/assignments' },
  { label: 'View Projects', hint: 'Browse active research', to: '/projects' },
  { label: 'Generate Report', hint: 'Export progress summary', to: '/reports' },
];

export const DASHBOARD_FIXTURES: DashboardData = {
  project: { total: 86, active: 71, completed: 9, archived: 6 },
  department: { students: 120, faculty: 112, awaiting: 8 },
  workspace: [
    {
      id: 'fx-1',
      student: 'Marcus Holloway',
      code: 'TH-2024-001',
      project: 'Neural Network Optimization for Edge Devices',
      phase: 'Literature Review',
      status: 'IN PROGRESS',
      supervisor: 'Dr. Elena Rossi',
    },
    {
      id: 'fx-2',
      student: 'Anita Desai',
      code: 'TH-2024-014',
      project: 'Blockchain-based Academic Credential Verification',
      phase: 'Proposal Defence',
      status: 'PENDING REVIEW',
      supervisor: 'Prof. Thomas Miller',
    },
    {
      id: 'fx-3',
      student: 'Robert Chen',
      code: 'TH-2023-089',
      project: 'Generative AI for Parametric Architectural Floor Plans',
      phase: 'Data Collection',
      status: 'DELAYED',
      supervisor: 'Dr. Alistair Vance',
    },
    {
      id: 'fx-4',
      student: 'Liam O\u2019Connor',
      code: 'TH-2024-022',
      project: 'IoT-enabled Smart Campus Energy Monitoring',
      phase: 'Methodology',
      status: 'IN PROGRESS',
      supervisor: 'Prof. Amara Okafor',
    },
    {
      id: 'fx-5',
      student: 'Yuki Tanaka',
      code: 'TH-2023-045',
      project: 'Federated Learning for Privacy-Preserving Student Analytics',
      phase: 'Final Review',
      status: 'COMPLETED',
      supervisor: 'Prof. Sarah Blake',
    },
  ],
  workspaceTotal: 212,
  tasks: {
    upcoming: [
      { kind: 'UPCOMING', title: "Review Ibrahim Musa's submission", due: 'Received 2 hours ago' },
    ],
    action: [
      { kind: 'ACTION REQUIRED', title: 'Submit Chapter One', due: 'Due in 3 days' },
      { kind: 'ACTION REQUIRED', title: 'Respond to feedback', due: 'Due tomorrow' },
    ],
    overdue: [{ kind: 'OVERDUE', title: 'Ethical Approval Form', due: 'URGENT' }],
    critical: {
      bodyLead: 'Faculty allocation for Fall 2024 Semester must be finalized by ',
      dateEm: 'Oct 30th',
      bodyTail: '. 14 students are currently unassigned.',
      cta: 'Assign Faculty Now \u2192',
      to: '/assignments',
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
  quickActions: QUICK_ACTIONS,
  // `dashboardRepo` flips this to true on the fallback path.
  usedFallback: false,
};
