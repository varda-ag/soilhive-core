import { useTranslation } from 'react-i18next';
import useTheme from 'hooks/useTheme';
import useDevice from 'hooks/useDevice';
import { useAuthContext } from '../auth/AuthContextProvider';

/**
 * Why the download buttons are disabled, while administrators require a signed-in user to export
 * and the visitor is signed out (docs/adr/0075); undefined otherwise. The backend refuses such an
 * Export anyway, so this only spares the visitor a refused request.
 * Undefined on a phone too: it cannot download whoever is signed in, so signing in is not the reason.
 */
export function useDownloadSignInHint(): string | undefined {
  const { t } = useTranslation('common');
  const { themeConfig } = useTheme();
  const { isAuthenticated } = useAuthContext();
  const { isMobileDevice } = useDevice();
  return themeConfig.exportLimits?.exportRequiresSignIn && !isAuthenticated && !isMobileDevice ? t('auth.sign_in_to_download') : undefined;
}
