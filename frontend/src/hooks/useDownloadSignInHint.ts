import { useTranslation } from 'react-i18next';
import useTheme from 'hooks/useTheme';
import { useAuthContext } from '../auth/AuthContextProvider';

/**
 * Why the download buttons are disabled, while administrators require a signed-in user to export
 * and the visitor is signed out (docs/adr/0074); undefined otherwise. The backend refuses such an
 * Export anyway, so this only spares the visitor a refused request.
 */
export function useDownloadSignInHint(): string | undefined {
  const { t } = useTranslation('common');
  const { themeConfig } = useTheme();
  const { isAuthenticated } = useAuthContext();
  return themeConfig.exportLimits?.exportRequiresSignIn && !isAuthenticated ? t('auth.sign_in_to_download') : undefined;
}
