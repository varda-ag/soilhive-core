// useRefetchOnSignInChange.test.tsx
//
// Query keys do not name the user, but some endpoints (e.g. GET /datasets) return private data only
// with a token. So a sign-in change without a page reload (another tab signed out, the session ended,
// the login server came back) must refetch, or the cache shows the wrong user's data.
import React from 'react';
import { act, render, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
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
  // Waits for the deferred cache work, which runs after the commit's effects.
  const change = async (next: object) => {
    (useAuthContext as jest.Mock).mockReturnValue(next);
    rerender();
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  };
  return { invalidate, change, queryClient };
};

describe('useRefetchOnSignInChange', () => {
  it('does not refetch on the first render', () => {
    const { invalidate } = setup(signedIn('alice'));

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('refetches every query when the user signs out', async () => {
    const { invalidate, change } = setup(signedIn('alice'));

    await change(signedOut);

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith();
  });

  it('refetches when the user signs in', async () => {
    const { invalidate, change } = setup(signedOut);

    await change(signedIn('alice'));

    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('refetches when another user signs in', async () => {
    const { invalidate, change } = setup(signedIn('alice'));

    await change(signedIn('bob'));

    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  // A page not on screen would otherwise show the old user's data, stale, until its refetch returns.
  it('drops the cached data of queries not on screen', async () => {
    const { change, queryClient } = setup(signedIn('alice'));
    queryClient.setQueryData(['datasets'], [{ id: 'private-dataset' }]);

    await change(signedOut);

    expect(queryClient.getQueryData(['datasets'])).toBeUndefined();
  });

  it('keeps cached data when the same user only gets a renewed token', async () => {
    const { change, queryClient } = setup(signedIn('alice', 'old'));
    queryClient.setQueryData(['datasets'], [{ id: 'private-dataset' }]);

    await change(signedIn('alice', 'new'));

    expect(queryClient.getQueryData(['datasets'])).toEqual([{ id: 'private-dataset' }]);
  });

  it('does not refetch when the same user only gets a renewed token', async () => {
    const { invalidate, change } = setup(signedIn('alice', 'old'));

    await change(signedIn('alice', 'new'));

    expect(invalidate).not.toHaveBeenCalled();
  });

  // React Query applies a query's new `enabled` in its own effect, which runs after this hook's effect when
  // the query sits deeper in the tree (as the pages do below <RefetchOnSignInChange /> in App).
  it('does not refetch a query that the sign-out disabled', async () => {
    const queryClient = new QueryClient();
    const fetchEntitlements = jest.fn().mockResolvedValue({});
    const Refetcher = () => {
      useRefetchOnSignInChange();
      return null;
    };
    const Page = () => {
      const { isAuthenticated } = useAuthContext();
      useQuery({ queryKey: ['entitlements'], queryFn: fetchEntitlements, enabled: isAuthenticated });
      return null;
    };
    const App = () => (
      <QueryClientProvider client={queryClient}>
        <Refetcher />
        <div>
          <Page />
        </div>
      </QueryClientProvider>
    );
    (useAuthContext as jest.Mock).mockReturnValue(signedIn('alice'));
    const view = render(<App />);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    fetchEntitlements.mockClear();

    (useAuthContext as jest.Mock).mockReturnValue(signedOut);
    view.rerender(<App />);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(fetchEntitlements).not.toHaveBeenCalled();
  });
});
