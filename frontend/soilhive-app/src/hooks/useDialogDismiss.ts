import { useState } from 'react';

const STORAGE_KEY_PROFIX = 'info-dialog-dismiss:';

export function useDialogDismiss(storageKey: string) {
  const fullKey = `${STORAGE_KEY_PROFIX}${storageKey}`;

  const [isDismissed, setIsDismissed] = useState(() => localStorage.getItem(fullKey) === 'true');

  const dismissPermanently = () => {
    localStorage.setItem(fullKey, 'true');
    setIsDismissed(true);
  };

  return {
    isDismissed,
    dismissPermanently,
  };
}
