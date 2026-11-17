// useRefetchOnSignInChange.test.tsx
//
// Query keys do not name the user, but some endpoints (e.g. GET /datasets) return private data only
// with a token. So a sign-in change without a page reload (another tab signed out, the session ended,
// the login server came back) must refetch, or the cache shows the wrong user's data.
import React from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRefetchOnSignInChange } from '../../src/hooks/useRefetchOnSignInChange';
import { useAuthContext } from '../../src/auth/AuthContextProvider';

jest.mock('../../src/auth/AuthContextProvider', () => ({
  useAuthContext: jest.fn(),
}));

const signedIn = (sub: string, token = 'tok') => ({ isAuthenticated: true, user: { access_token: token, profile: { sub } } });
const signedOut = { isAuthenticated: false, user: null };

const setup = (initial: object) => {
  const queryClient = new QueryClient();
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
  (useAuthContext as jest.Mock).mockReturnValue(initial);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { rerender } = renderHook(() => useRefetchOnSignInChange(), { wrapper });
  const change = (next: object) => {
    (useAuthContext as jest.Mock).mockReturnValue(next);
    rerender();
  };
  return { invalidate, change };
};

describe('useRefetchOnSignInChange', () => {
  it('does not refetch on the first render', () => {
    const { invalidate } = setup(signedIn('alice'));

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('refetches every query when the user signs out', () => {
    const { invalidate, change } = setup(signedIn('alice'));

    change(signedOut);

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith();
  });

  it('refetches when the user signs in', () => {
    const { invalidate, change } = setup(signedOut);

    change(signedIn('alice'));

    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('refetches when another user signs in', () => {
    const { invalidate, change } = setup(signedIn('alice'));

    change(signedIn('bob'));

    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('does not refetch when the same user only gets a renewed token', () => {
    const { invalidate, change } = setup(signedIn('alice', 'old'));

    change(signedIn('alice', 'new'));

    expect(invalidate).not.toHaveBeenCalled();
  });
});
