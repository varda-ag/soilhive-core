import CloseIcon from 'assets/icons/cross-icon.svg?react';
import MegaphoneIcon from 'assets/icons/megaphone-icon.svg?react';
import { Button } from 'components/UI';
import styles from './NotificationBanner.module.scss';
import { htmlDisplay } from '../../utilities/html-display';

export function NotificationBanner({ htmlMessage, onClose }: { htmlMessage: string; onClose?: () => void }) {
  return (
    <div className={styles.NotificationBanner}>
      <MegaphoneIcon className={styles.MegaphoneIcon} />
      <Button className={styles.CloseButton} type="tertiary" isIconOnly onClick={onClose}>
        <CloseIcon />
      </Button>
      <div className={styles.Message}>{htmlDisplay(htmlMessage)}</div>
    </div>
  );
}
