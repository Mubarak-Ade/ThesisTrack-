import { Navigate, Route, Routes } from 'react-router-dom';
import InviteTokenGuard from './components/InviteTokenGuard';
import RequireAuth from './components/RequireAuth';
import DashboardStub from './pages/DashboardStub';
import Forbidden from './pages/Forbidden';
import ForgotPassword from './pages/ForgotPassword';
import Home from './pages/Home';
import InviteActivate from './pages/InviteActivate';
import InviteAlreadyActivated from './pages/InviteAlreadyActivated';
import InviteConfirm from './pages/InviteConfirm';
import InviteInvalid from './pages/InviteInvalid';
import InviteSuccess from './pages/InviteSuccess';
import InviteWelcome from './pages/InviteWelcome';
import Login from './pages/Login';
import PasswordResetEmailSent from './pages/PasswordResetEmailSent';
import PasswordResetSuccess from './pages/PasswordResetSuccess';
import ResetPassword from './pages/ResetPassword';
import SessionExpired from './pages/SessionExpired';
import Unauthorized from './pages/Unauthorized';

/** All 16 paths from spec §3. Invite forms are token-gated. */
function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <DashboardStub />
          </RequireAuth>
        }
      />

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
