// SsrAuthContextProvider.test.tsx
//
// The server renders an SSR page anonymously when the token is expired, so the hydrated page must
// agree: drop the expired token from storage and report nobody signed in.
import { render } from '@testing-library/react';
import { SsrAuthContextProvider, useAuthContext } from '../../src/auth/AuthContextProvider';
import { clearToken, getToken } from '../../src/auth/tokenStore';

jest.mock('hooks/useApiQuery', () => ({
  useApiQuery: jest.fn(),
}));

jest.mock('../../src/auth/tokenStore', () => ({
  saveToken: jest.fn(),
  clearToken: jest.fn(),
  getToken: jest.fn(),
}));

const makeToken = (payload: Record<string, unknown>) => `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
const nowSeconds = () => Math.floor(Date.now() / 1000);

const AuthState = () => {
  const { isAuthenticated, user } = useAuthContext();
  return <span data-testid="auth">{`${isAuthenticated}:${user?.access_token ?? 'none'}`}</span>;
};

const renderProvider = () =>
  render(
    <SsrAuthContextProvider>
      <AuthState />
    </SsrAuthContextProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SsrAuthContextProvider', () => {
  it('keeps a valid token', () => {
    const token = makeToken({ exp: nowSeconds() + 3600 });
    (getToken as jest.Mock).mockReturnValue(token);

    const { getByTestId } = renderProvider();

    expect(getByTestId('auth')).toHaveTextContent(`true:${token}`);
    expect(clearToken).not.toHaveBeenCalled();
  });

  it('clears an expired token and reports nobody signed in', () => {
    (getToken as jest.Mock).mockReturnValue(makeToken({ exp: nowSeconds() - 60 }));

    const { getByTestId } = renderProvider();

    expect(getByTestId('auth')).toHaveTextContent('false:none');
    expect(clearToken).toHaveBeenCalledTimes(1);
  });

  it('clears the token before children render, so their queries never send it', () => {
    (getToken as jest.Mock).mockReturnValue(makeToken({ exp: nowSeconds() - 60 }));
    const Child = () => {
      expect(clearToken).toHaveBeenCalled();
      return null;
    };

    render(
      <SsrAuthContextProvider>
        <Child />
      </SsrAuthContextProvider>,
    );
  });

  it('reports nobody signed in without a token', () => {
    (getToken as jest.Mock).mockReturnValue(null);

    const { getByTestId } = renderProvider();

    expect(getByTestId('auth')).toHaveTextContent('false:none');
    expect(clearToken).not.toHaveBeenCalled();
  });
});
