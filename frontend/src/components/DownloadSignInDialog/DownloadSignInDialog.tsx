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
  onClose: () => void;
}

/**
 * Asks a signed-out visitor to log in before downloading, as the legacy platform did (docs/adr/0075).
 * Like it, the sign-in brings them back to the page they were on, the map's selection and filters with
 * them, and they click Download again.
 */
export function DownloadSignInDialog({ visible, pageState, onClose }: Props) {
  const { t } = useTranslation('common');
  const { login } = useAuthContext();
  const getSigninState = useAvailabilitySigninState();

  const onLogin = () => {
    onClose();
    login({ ...getSigninState(), ...pageState });
  };

  return (
    <Dialog
      visible={visible}
      ariaLabel={t('auth.sign_in_to_download')}
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
      <p className={styles.Message}>{t('auth.sign_in_to_download')}</p>
    </Dialog>
  );
}
