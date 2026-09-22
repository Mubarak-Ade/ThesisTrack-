import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { api } from '../lib/http';
import { useAuthStore } from '../stores/auth';

/**
 * Post-login placeholder (real dashboards are out of scope) — proves the
 * session works: name from the API, sign-out hits the real endpoint.
 */
export default function DashboardStub() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const signOut = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // The cookie may already be gone — local sign-out still proceeds.
    }
    useAuthStore.getState().clear();
    navigate('/login', { replace: true });
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background">
      <div className="text-center">
        <h1 className="font-display text-3xl font-semibold text-foreground">ThesisTrack</h1>
        <p className="mt-2 text-muted-foreground">
          {user ? `Signed in as ${user.firstName} ${user.lastName}` : 'Signed in'}
        </p>
        {user && <p className="text-sm text-muted-foreground/80">{user.email}</p>}
      </div>
      <Button onClick={signOut}>Sign Out</Button>
    </main>
  );
}
