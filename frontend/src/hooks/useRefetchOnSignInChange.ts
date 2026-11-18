import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '../auth/AuthContextProvider';

/**
 * Refetches what is on screen, and drops every other cached query, when the signed-in user changes
 * without a page reload: another tab signed out, the session ended, or the login server came back.
 * Query keys do not name the user, but endpoints such as GET /datasets return private data only with
 * a token. A renewed token of the same user changes nothing.
 */
export function useRefetchOnSignInChange() {
  const { isAuthenticated, user } = useAuthContext();
  const queryClient = useQueryClient();

  // Who the requests are made for. null: anonymous.
  const signedInAs = isAuthenticated ? (user?.profile?.sub ?? '') : null;
  const previous = useRef(signedInAs);

  useEffect(() => {
    if (previous.current === signedInAs) return;
    previous.current = signedInAs;
    // After this commit's effects: React Query applies each query's new `enabled` in an effect of its own,
    // so a query the sign-out disabled (e.g. entitlements) would otherwise refetch without a token and 401.
    const timer = setTimeout(() => {
      // Not resetQueries: it would also blank /auth/config and the theme, which unmounts the app.
      // Pages not on screen start empty instead of showing the old user's data while they refetch.
      queryClient.removeQueries({ type: 'inactive' });
      void queryClient.invalidateQueries();
    });
    return () => clearTimeout(timer);
  }, [signedInAs, queryClient]);
}
