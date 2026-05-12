import { useCallback } from 'react';

const STORAGE_KEY_PROFIX = 'info-dialog-dismiss:';

export function useDialogDismiss(storageKey: string) {
  const fullKey = `${STORAGE_KEY_PROFIX}${storageKey}`;

  const isDismissed = localStorage.getItem(fullKey) === 'true';

  const dismissPermanently = useCallback(() => {
    localStorage.setItem(fullKey, 'true');
  }, [fullKey]);

  return {
    isDismissed,
    dismissPermanently,
  };
}
