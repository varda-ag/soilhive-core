import { useEffect } from 'react';

// Calls onSignedOut when another tab removes a sign-out key from localStorage, or clears it.
// The browser fires `storage` events only in the other tabs, never in the tab that wrote.
export function useSignOutInOtherTab(isSignOutKey: (key: string) => boolean, onSignedOut: () => void) {
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || event.newValue !== null) return;
      // A null key means localStorage.clear().
      if (event.key === null || isSignOutKey(event.key)) onSignedOut();
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [isSignOutKey, onSignedOut]);
}
