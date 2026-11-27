import { useTranslation } from 'react-i18next';
import { Dialog } from 'components/Dialog/Dialog';
import { useAvailabilitySigninState } from 'hooks/useAvailabilitySigninState';
import { useAuthContext } from '../../auth/AuthContextProvider';
import type { SigninPageState } from '../../auth/signinPageState';

import styles from './DownloadSignInDialog.module.scss';

interface Props {
  visible: boolean;
  // What the page itself puts back after the sign-in, beside the map's selection and filters
  pageState?: SigninPageState;
  // What the visitor logs in for; downloading when left out
  message?: string;
  onClose: () => void;
}

/**
 * Asks a signed-out visitor to log in before downloading, as the legacy platform did (docs/adr/0075).
 * Like it, the sign-in brings them back to the page they were on, the map's selection and filters with
 * them, and they click Download again. Also used before other actions that need a sign-in, with a
 * `message` of their own.
 */
export function DownloadSignInDialog({ visible, pageState, message, onClose }: Props) {
  const { t } = useTranslation('common');
  const shownMessage = message ?? t('auth.sign_in_to_download');
  const { login } = useAuthContext();
  const getSigninState = useAvailabilitySigninState();

  const onLogin = () => {
    onClose();
    login({ ...getSigninState(), ...pageState });
  };

  return (
    <Dialog
      visible={visible}
      ariaLabel={shownMessage}
      secondaryText={t('auth.cancel')}
      primaryText={t('auth.login')}
      className={styles.DownloadSignInDialog}
      contentClassName={styles.Content}
      closeOnOverlay={true}
      onPrimary={onLogin}
      onSecondary={onClose}
      onClose={onClose}
    >
      <div className={styles.Hero} />
      <p className={styles.Message}>{shownMessage}</p>
    </Dialog>
  );
}
