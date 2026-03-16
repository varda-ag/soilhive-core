import { Navigate, Outlet } from 'react-router';
import { useAuthContext } from '../auth/AuthContextProvider';

export function AdminPortalGuard() {
  const { isAuthenticated, isLoading } = useAuthContext();

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
