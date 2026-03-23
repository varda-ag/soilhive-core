import { useState } from 'react';
import { Dialog } from '../Dialog/Dialog';

import styles from './InfoDialog.module.scss';
import { Checkbox } from '../Checkbox/Checkbox';

import { useTranslation } from 'react-i18next';

interface Props {
  isVisible: boolean;
  storageKey: string;
  header: string;
  message: string;
  onContinue: () => void;
  onCancel: () => void;
}

const STORAGE_KEY_PREFIX = 'info-dialog-dismissed:';

export function InfoDialog({ isVisible, storageKey, header, message, onContinue, onCancel }: Props) {
  const { t } = useTranslation('common');

  const [dontShowAgain, setDontShowAgain] = useState(false);

  const isDismissed = () => localStorage.getItem(`${STORAGE_KEY_PREFIX}${storageKey}`) === 'true';

  const visible = isVisible && !isDismissed();

  const handleContinue = () => {
    if (dontShowAgain) {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${storageKey}`, 'true');
    }
    onContinue?.();
  };

  const handleCancel = () => onCancel?.();

  return (
    <Dialog visible={visible} header={header} onContinue={handleContinue} onCancel={handleCancel}>
      <p>{message}</p>
      <Checkbox
        className={styles.DontShowAgain}
        size="small"
        label={t('dialog.dont_show_again')}
        value={dontShowAgain}
        onChange={setDontShowAgain}
      ></Checkbox>
    </Dialog>
  );
}
