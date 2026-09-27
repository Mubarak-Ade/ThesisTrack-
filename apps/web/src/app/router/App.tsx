import { Navigate, Route, Routes } from 'react-router-dom';
import InviteTokenGuard from '@/features/auth/components/InviteTokenGuard';
import RequireAuth from './RequireAuth';
import ConsoleLayout from '@/app/layouts/ConsoleLayout';
import Forbidden from '@/features/auth/screens/Forbidden';
import ForgotPassword from '@/features/auth/screens/ForgotPassword';
import Home from '@/pages/Home';
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
import Unauthorized from '@/features/auth/screens/Unauthorized';
import CoordinatorDashboard from '@/features/dashboard/screens/CoordinatorDashboard';
import SupervisorList from '@/features/faculty/screens/SupervisorList';
import StudentList from '@/features/students/screens/StudentList';
import UserCreate from '@/features/users/screens/UserCreate';
import UserImport from '@/features/users/screens/UserImport';
import UserList from '@/features/users/screens/UserList';
import UserProfile from '@/features/users/screens/UserProfile';

/** All 16 paths from spec §3. Invite forms are token-gated. */
function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />

      {/* Admin console (spec §2): shell + five screens; static before :userId. */}
      <Route
        element={
          <RequireAuth>
            <ConsoleLayout />
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<CoordinatorDashboard />} />
        <Route path="/faculty" element={<SupervisorList />} />
        <Route path="/students" element={<StudentList />} />
        <Route path="/users" element={<UserList />} />
        <Route path="/users/new" element={<UserCreate />} />
        <Route path="/users/import" element={<UserImport />} />
        <Route path="/users/:userId" element={<UserProfile />} />
      </Route>

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
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route path="/forbidden" element={<Forbidden />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
