import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '../auth/AuthContextProvider';

/**
 * Refetches every query when the signed-in user changes without a page reload: another tab signed out,
 * the session ended, or the login server came back. Query keys do not name the user, but endpoints such
 * as GET /datasets return private data only with a token. A renewed token of the same user changes nothing.
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
    void queryClient.invalidateQueries();
  }, [signedInAs, queryClient]);
}
