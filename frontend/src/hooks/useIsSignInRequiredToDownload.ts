import useTheme from 'hooks/useTheme';
import { useAuthContext } from '../auth/AuthContextProvider';

/**
 * Whether a download must ask the visitor to log in first: administrators require a signed-in user to
 * export and the visitor is signed out (docs/adr/0075). The backend refuses such an Export anyway, so
 * asking first only spares the visitor a refused request.
 */
export function useIsSignInRequiredToDownload(): boolean {
  const { themeConfig } = useTheme();
  const { isAuthenticated } = useAuthContext();
  return !!themeConfig.exportLimits?.exportRequiresSignIn && !isAuthenticated;
}
