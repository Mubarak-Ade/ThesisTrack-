import {
  Activity,
  Bell,
  FileBarChart2,
  FolderGit2,
  FolderKanban,
  GitBranch,
  GraduationCap,
  LayoutDashboard,
  ScrollText,
  Settings,
  UserCheck,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/lib/api/http';

/** One entry of a collapsible group ("My Project ▾ …"). */
export interface NavChild {
  label: string;
  to: string;
}

/**
 * Discriminated so every nav entry is either a link **or** a group — never a
 * dead item. §10.5's columns render as links because §10.3's route tree
 * backs them: screens that land in a later phase route to PendingScreen.
 */
export type NavItem =
  | { label: string; icon: LucideIcon; to: string; children?: undefined }
  | { label: string; icon: LucideIcon; to?: undefined; children: NavChild[] };

export interface NavState {
  /** §10.5: "My Project ▾" appears only once the student is approved. */
  studentApproved: boolean;
}

const DASHBOARD: NavItem = { label: 'Dashboard', icon: LayoutDashboard, to: '/dashboard' };
const PROPOSALS: NavItem = { label: 'Proposals', icon: ScrollText, to: '/proposals' };
const NOTIFICATIONS: NavItem = { label: 'Notifications', icon: Bell, to: '/notifications' };
const SETTINGS: NavItem = { label: 'Settings', icon: Settings, to: '/settings' };

/** Student (approved): "+ My Project ▾ Overview · Milestones · …" (§10.5). */
const MY_PROJECT: NavItem = {
  label: 'My Project',
  icon: FolderKanban,
  children: [
    { label: 'Overview', to: '/project/overview' },
    { label: 'Milestones', to: '/project/milestones' },
    { label: 'Submissions', to: '/project/submissions' },
    { label: 'Feedback', to: '/project/feedback' },
    { label: 'Activity', to: '/project/activity' },
  ],
};

/**
 * The three §10.5 nav definitions — exactly the table's columns, item for
 * item (LOCKED, baseline §19): the dashboard's job is to say where the user
 * is and what to do next, so navigation is role- and state-driven, never one
 * shared menu.
 *
 * Supervisor's "Students" is the caseload (`/supervision/*`), the
 * administrator's is the directory (`/students`); "My Project" sits directly
 * after Dashboard so the post-approval work is the first thing in reach.
 */
export function navForRole(role: Role, state: NavState): NavItem[] {
  switch (role) {
    case 'student':
      return state.studentApproved
        ? [DASHBOARD, MY_PROJECT, PROPOSALS, NOTIFICATIONS, SETTINGS]
        : [DASHBOARD, PROPOSALS, NOTIFICATIONS, SETTINGS];
    case 'supervisor':
      return [
        DASHBOARD,
        { label: 'Students', icon: UserRound, to: '/supervision' },
        PROPOSALS,
        NOTIFICATIONS,
        SETTINGS,
      ];
    case 'administrator':
      // Workflows sits between Assignments and Monitoring: a PROPOSED §10.5
      // delta (2026-10-04) — the LOCKED table pre-dates FR-CW's workflow
      // builder, and §16.3's "Workflow definitions" row needs a nav home
      // (flips LOCKED at Phase 16).
      return [
        DASHBOARD,
        { label: 'Faculty', icon: GraduationCap, to: '/faculty' },
        { label: 'Students', icon: UserRound, to: '/students' },
        { label: 'Projects', icon: FolderGit2, to: '/projects' },
        PROPOSALS,
        { label: 'Assignments', icon: UserCheck, to: '/assignments' },
        { label: 'Workflows', icon: GitBranch, to: '/workflows' },
        { label: 'Monitoring', icon: Activity, to: '/monitoring' },
        { label: 'Reports', icon: FileBarChart2, to: '/reports' },
        NOTIFICATIONS,
        SETTINGS,
      ];
  }
}
