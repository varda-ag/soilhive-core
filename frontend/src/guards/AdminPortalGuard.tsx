import { Navigate } from 'react-router';
import { useAuthContext } from '../auth/AuthContextProvider';
import { AdminPortalLayout } from '../layouts';
import { ADMIN_PORTAL_ACCESS, useEntitlements } from 'hooks/useEntitlementsHook';

export function AdminPortalGuard() {
  const { isLoading } = useAuthContext();
  const { can } = useEntitlements();

  if (isLoading) {
    return null;
  }

  if (!can(ADMIN_PORTAL_ACCESS)) {
    return <Navigate to="/" replace />;
  }

  return <AdminPortalLayout />;
}
