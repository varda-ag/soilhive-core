import { useEffect } from 'react';

// Calls onSignedIn when another tab writes a sign-in key to localStorage (a sign-in or a renew).
// Tabs share the stored token, so a tab that missed the sign-in would still send it with its requests.
// The browser fires `storage` events only in the other tabs, never in the tab that wrote.
export function useSignInInOtherTab(isSignInKey: (key: string) => boolean, onSignedIn: () => void) {
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || event.newValue === null || event.key === null) return;
      if (isSignInKey(event.key)) onSignedIn();
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [isSignInKey, onSignedIn]);
}
