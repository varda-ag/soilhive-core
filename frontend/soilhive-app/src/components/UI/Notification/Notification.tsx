import { useMemo } from 'react';
import classnames from 'classnames';
import CrossIcon from 'assets/icons/small-cross-icon.svg?react';
import type { NotificationType } from 'types/components';

import styles from './Notification.module.scss';

interface Props {
  title: string;
  message?: string;
  type?: NotificationType;
  onClose: () => void;
}

export function Notification({ title, message, type = 'error', onClose }: Props) {
  const typeClass = useMemo(
    () =>
      ({
        error: styles.Error,
        warning: styles.Warning,
        success: styles.Success,
      })[type],
    [type],
  );

  return (
    <div className={classnames(styles.Notification, typeClass)} data-testid="sh-ui-notification">
      <CrossIcon data-testid="sh-ui-notification-close" className={styles.CloseIcon} role="button" onClick={onClose} />
      <div className={styles.Title}>{title}</div>
      {!!message && <div className={styles.Message}>{message}</div>}
    </div>
  );
}
