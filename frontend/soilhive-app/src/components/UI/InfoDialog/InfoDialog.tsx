import { useState } from 'react';
import { Dialog } from '../Dialog/Dialog';

import styles from './InfoDialog.module.scss';
import { Checkbox } from '../Checkbox/Checkbox';

import { useTranslation } from 'react-i18next';
import { useDialogDismiss } from 'hooks/useDialogDismiss';

interface Props {
  isVisible: boolean;
  storageKey: string;
  header: string;
  message: string;
  onContinue: () => void;
  onCancel: () => void;
}

export function InfoDialog({ isVisible, storageKey, header, message, onContinue, onCancel }: Props) {
  const { t } = useTranslation('common');

  const [dontShowAgain, setDontShowAgain] = useState(false);

  const { isDismissed, dismissPermanently } = useDialogDismiss(storageKey);

  const visible = isVisible && !isDismissed;

  const handleContinue = () => {
    if (dontShowAgain) {
      dismissPermanently();
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
