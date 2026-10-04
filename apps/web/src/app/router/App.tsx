import { Navigate, Route, Routes } from 'react-router-dom';
import InviteTokenGuard from '@/features/auth/components/InviteTokenGuard';
import RequireAuth from './RequireAuth';
import RequireRole from './RequireRole';
import RoleShell from './RoleShell';
import DashboardByRole from './DashboardByRole';
import ErrorBoundary from '@/components/feedback/ErrorBoundary';
import Forbidden from '@/features/auth/screens/Forbidden';
import ForgotPassword from '@/features/auth/screens/ForgotPassword';
import InviteActivate from '@/features/auth/screens/InviteActivate';
import InviteAlreadyActivated from '@/features/auth/screens/InviteAlreadyActivated';
import InviteConfirm from '@/features/auth/screens/InviteConfirm';
import InviteInvalid from '@/features/auth/screens/InviteInvalid';
import InviteSuccess from '@/features/auth/screens/InviteSuccess';
import InviteWelcome from '@/features/auth/screens/InviteWelcome';
import Login from '@/features/auth/screens/Login';
import PasswordResetEmailSent from '@/features/auth/screens/PasswordResetEmailSent';
import PasswordResetSuccess from '@/features/auth/screens/PasswordResetSuccess';
import ResetPassword from '@/features/auth/screens/ResetPassword';
import SessionExpired from '@/features/auth/screens/SessionExpired';
import SupervisorList from '@/features/faculty/screens/SupervisorList';
import StudentList from '@/features/students/screens/StudentList';
import UserCreate from '@/features/users/screens/UserCreate';
import UserImport from '@/features/users/screens/UserImport';
import UserList from '@/features/users/screens/UserList';
import UserProfile from '@/features/users/screens/UserProfile';
import ProposalDetail from '@/features/proposals/screens/ProposalDetail';
import ProposalEditor from '@/features/proposals/screens/ProposalEditor';
import ProposalList from '@/features/proposals/screens/ProposalList';
import Home from '@/pages/Home';
import NotFound from '@/pages/NotFound';
import NotificationsScreen from '@/features/notifications/screens/NotificationsScreen';
import SettingsScreen from '@/features/settings/screens/SettingsScreen';
import ProjectLayout from '@/features/project/screens/ProjectLayout';
import ProjectOverview from '@/features/project/screens/ProjectOverview';
import ProjectMilestones from '@/features/project/screens/ProjectMilestones';
import ProjectSubmissions from '@/features/project/screens/ProjectSubmissions';
import SubmissionComposer from '@/features/project/screens/SubmissionComposer';
import SubmissionDetail from '@/features/project/screens/SubmissionDetail';
import ProjectFeedback from '@/features/project/screens/ProjectFeedback';
import ProjectActivity from '@/features/project/screens/ProjectActivity';
import CaseloadList from '@/features/supervision/screens/CaseloadList';
import StudentDetail from '@/features/supervision/screens/StudentDetail';
import StudentOverview from '@/features/supervision/screens/StudentOverview';
import StudentMilestones from '@/features/supervision/screens/StudentMilestones';
import StudentSubmissions from '@/features/supervision/screens/StudentSubmissions';
import SubmissionReview from '@/features/supervision/screens/SubmissionReview';
import StudentFeedback from '@/features/supervision/screens/StudentFeedback';
import Unauthorized from '@/features/auth/screens/Unauthorized';
import AdminProjects from '@/features/admin/screens/AdminProjects';
import AdminAssignments from '@/features/admin/screens/AdminAssignments';
import WorkflowList from '@/features/admin/screens/WorkflowList';
import WorkflowEditor from '@/features/admin/screens/WorkflowEditor';
import AdminMonitoring from '@/features/admin/screens/AdminMonitoring';
import AdminReports from '@/features/admin/screens/AdminReports';

/**
 * Route table (spec §10.3, PROPOSED — the tree below is its literal shape):
 *
 * - `/` is the **public landing page**; `*` renders the 404 screen instead
 *   of silently bouncing to `/` (§16.1 Not-found chrome).
 * - Authenticated screens sit under `RequireAuth` → `RoleShell`: one shell
 *   that picks layout + nav by `user.role`, so `/dashboard` resolves per
 *   role (§10.3) rather than being a fixed admin list.
 * - `RequireRole` wraps role-specific subtrees: the whole `/users*` and
 *   department directory are administrator-only (§4.5), `/supervision/*` is
 *   the supervisor caseload and `/project/*` is the student's own project
 *   (both per §10.3's column comments). Mismatch → `/forbidden`.
 * - `/proposals/*`, `/notifications`, `/settings` stay reachable by every
 *   role — their screens scope the data themselves.
 * - Screens whose build step lands in a later phase render PendingScreen
 *   (user-facing "Coming soon" chrome), never a dead link or a 404. Phase 13
 *   replaced the administrator's four gap screens with the live §16.3
 *   surface, so the table itself carries none of them any more.
 *
 * ErrorBoundary sits above the table so a crashing screen degrades to the
 * ErrorState recovery UI instead of a blank page (§16.1).
 */
export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Home />} />

        {/* Authenticated shell: guard → role-aware layout + nav (§10.3). */}
        <Route element={<RequireAuth><RoleShell /></RequireAuth>}>
          <Route path="/dashboard" element={<DashboardByRole />} />

          {/* Cross-role routes — scoped by their own screens (§10.3). */}
          <Route path="/proposals" element={<ProposalList />} />
          <Route path="/proposals/new" element={<ProposalEditor />} />
          <Route path="/proposals/:proposalId" element={<ProposalDetail />} />
          <Route path="/proposals/:proposalId/edit" element={<ProposalEditor />} />
          <Route path="/notifications" element={<NotificationsScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />

          {/* Student, post-approval (§10.3 column comment) — the §16.3
              "My Project" section: one layout resolving the project, five
              tabs beneath it (plan 11.3/11.4). */}
          <Route element={<RequireRole roles={['student']} />}>
            <Route path="/project" element={<ProjectLayout />}>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<ProjectOverview />} />
              <Route path="milestones" element={<ProjectMilestones />} />
              <Route path="submissions" element={<ProjectSubmissions />} />
              <Route path="submissions/new" element={<SubmissionComposer />} />
              <Route path="submissions/:submissionId" element={<SubmissionDetail />} />
              <Route path="feedback" element={<ProjectFeedback />} />
              <Route path="activity" element={<ProjectActivity />} />
            </Route>
          </Route>

          {/* Supervisor caseload (§10.3) — plan 12.2's drill-in: one layout
              per student, four tabs beneath it (Overview · Milestones ·
              Submissions · Feedback) plus the §11.6 review screen. */}
          <Route element={<RequireRole roles={['supervisor']} />}>
            <Route path="/supervision" element={<CaseloadList />} />
            <Route path="/supervision/:studentId" element={<StudentDetail />}>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<StudentOverview />} />
              <Route path="milestones" element={<StudentMilestones />} />
              <Route path="submissions" element={<StudentSubmissions />} />
              <Route path="submissions/:submissionId" element={<SubmissionReview />} />
              <Route path="feedback" element={<StudentFeedback />} />
            </Route>
          </Route>

          {/* Administrator subtree (§4.5): directory, fixtures and the gap
              screens that ship with the admin phase. */}
          <Route element={<RequireRole roles={['administrator']} />}>
            <Route path="/faculty" element={<SupervisorList />} />
            <Route path="/students" element={<StudentList />} />
            <Route path="/users" element={<UserList />} />
            <Route path="/users/new" element={<UserCreate />} />
            <Route path="/users/import" element={<UserImport />} />
            <Route path="/users/:userId" element={<UserProfile />} />
            {/* §16.3 oversight surface (plan 13.1/13.3) — all LIVE-ONLY. */}
            <Route path="/projects" element={<AdminProjects />} />
            <Route path="/assignments" element={<AdminAssignments />} />
            <Route path="/workflows" element={<WorkflowList />} />
            <Route path="/workflows/:workflowId" element={<WorkflowEditor />} />
            <Route path="/monitoring" element={<AdminMonitoring />} />
            <Route path="/reports" element={<AdminReports />} />
          </Route>
        </Route>

        {/* Public auth, invitation and status screens. */}
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/forgot-password/sent" element={<PasswordResetEmailSent />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/reset-password/success" element={<PasswordResetSuccess />} />

        <Route
          path="/invite"
          element={
            <InviteTokenGuard>
              <InviteWelcome />
            </InviteTokenGuard>
          }
        />
        <Route
          path="/invite/confirm"
          element={
            <InviteTokenGuard>
              <InviteConfirm />
            </InviteTokenGuard>
          }
        />
        <Route
          path="/invite/activate"
          element={
            <InviteTokenGuard>
              <InviteActivate />
            </InviteTokenGuard>
          }
        />
        <Route path="/invite/activate/success" element={<InviteSuccess />} />
        <Route path="/invite/already-activated" element={<InviteAlreadyActivated />} />
        <Route path="/invite/invalid" element={<InviteInvalid />} />

        <Route path="/session-expired" element={<SessionExpired />} />

        {/* Guard destinations + the 404 screen (all public). */}
        <Route path="/unauthorized" element={<Unauthorized />} />
        <Route path="/forbidden" element={<Forbidden />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ErrorBoundary>
  );
}
