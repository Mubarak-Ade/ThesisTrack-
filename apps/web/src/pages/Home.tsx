import { Navigate } from 'react-router-dom';

/** `/` lands on the stub dashboard; RequireAuth handles the rest. */
export default function Home() {
  return <Navigate to="/dashboard" replace />;
}
