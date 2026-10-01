import { Navigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuthContext } from '../auth/AuthContextProvider';
import { AuthModes } from '../auth/types';
import Header from 'components/Header/Header';
import { SignInPrompt } from 'components/SignInPrompt/SignInPrompt';
import { AdminPortalLayout } from '../layouts';
import { ADMIN_PORTAL_ACCESS, useEntitlements } from 'hooks/useEntitlementsHook';

export function AdminPortalGuard() {
  const { t } = useTranslation('common');
  const { isLoading, isAuthenticated, authMode } = useAuthContext();
  const { can } = useEntitlements();

  if (isLoading) {
    return null;
  }

  // Ask anonymous visitors to sign in here rather than bouncing them, so a
  // sign-in returns them to the admin URL they opened.
  if (!isAuthenticated && authMode !== AuthModes.NONE) {
    return (
      <>
        <Header />
        <SignInPrompt title={t('auth.sign_in_prompt.title', { name: t('auth.sign_in_prompt.admin_portal') })} />
      </>
    );
  }

  if (!can(ADMIN_PORTAL_ACCESS)) {
    return <Navigate to="/" replace />;
  }

  return <AdminPortalLayout />;
}
