import { Trans, useTranslation } from 'react-i18next';

import { Dialog } from 'components/Dialog/Dialog';
import AlarmBellIcon from 'assets/icons/color-alarm-bell-icon.svg?react';
import LockCircleIcon from 'assets/icons/color-lock-circle-icon.svg?react';

import styles from './AccessRequestStatusDialog.module.scss';

interface Props {
  // 'sent': the request just went to the admins. 'alreadyRequested': the user's own pending request
  // names the Dataset already, so the backend would refuse another (a 409).
  status: 'sent' | 'alreadyRequested';
  datasetName: string;
  onClose: () => void;
}

// The dashboards plugin's popups after a request (SP-5988), with Close only: the page that lists the
// user's own requests, which their "Go to profile page" leads to, is not built yet (SP-5989).
export function AccessRequestStatusDialog({ status, datasetName, onClose }: Props) {
  const { t } = useTranslation('availability');
  const isSent = status === 'sent';

  return (
    <Dialog
      visible
      header={t(isSent ? 'access_request.sent.title' : 'access_request.already_requested.title')}
      className={styles.AccessRequestStatusDialog}
      contentClassName={styles.Content}
      primaryText={t('access_request.close')}
      closeOnOverlay
      onPrimary={onClose}
      onClose={onClose}
    >
      {isSent ? <AlarmBellIcon /> : <LockCircleIcon />}
      <p className={styles.Text}>
        {isSent ? (
          t('access_request.sent.text')
        ) : (
          <Trans t={t} i18nKey="access_request.already_requested.text" components={{ strong: <strong /> }} values={{ datasetName }} />
        )}
      </p>
    </Dialog>
  );
}
