import { useTranslation } from 'react-i18next';
import { Dialog } from 'components/Dialog/Dialog';
import { useAuthContext } from '../../auth/AuthContextProvider';

import styles from './DownloadSignInDialog.module.scss';

interface Props {
  visible: boolean;
  // Where an OIDC sign-in brings the visitor back: the page their download was heading to. The current page if unset.
  returnTo?: string;
  onClose: () => void;
}

/** Asks a signed-out visitor to log in before downloading, as the legacy platform did (docs/adr/0075). */
export function DownloadSignInDialog({ visible, returnTo, onClose }: Props) {
  const { t } = useTranslation('common');
  const { login } = useAuthContext();

  const onLogin = () => {
    onClose();
    login(returnTo);
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
