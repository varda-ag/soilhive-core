import { useEffect } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { AuthContextProvider, useAuthContext } from '../../src/auth/AuthContextProvider';
import { useApiQuery } from 'hooks/useApiQuery';
import { useRequest } from '../../src/api-client';
import { jwtDecode } from 'jwt-decode';

jest.mock('hooks/useApiQuery', () => ({
  useApiQuery: jest.fn(),
}));

jest.mock('../../src/api-client', () => ({
  useRequest: jest.fn(),
}));

jest.mock('jwt-decode', () => ({
  jwtDecode: jest.fn(),
}));

jest.mock('../../src/auth/tokenStore', () => ({
  getToken: jest.fn(() => null),
  saveToken: jest.fn(),
  clearToken: jest.fn(),
}));

const onPageMount = jest.fn();

const Page = () => {
  const { isAuthenticated, isLoading, login } = useAuthContext();
  useEffect(() => onPageMount(), []);
  return (
    <>
      <span data-testid="auth">{`${isAuthenticated}:${isLoading}`}</span>
      <button onClick={() => login()}>open login</button>
    </>
  );
};

describe('PasswordAuthProvider', () => {
  it('keeps the page mounted and not loading while a login is in flight', async () => {
    let resolveLogin: (token: { access_token: string }) => void = () => {};
    const request = jest.fn(() => new Promise(resolve => (resolveLogin = resolve)));
    (useApiQuery as jest.Mock).mockReturnValue({ data: { authMode: 'password' }, isLoading: false });
    (useRequest as jest.Mock).mockReturnValue({ request });
    (jwtDecode as jest.Mock).mockReturnValue({ sub: 'data-admin', exp: Math.floor(Date.now() / 1000) + 3600 });

    render(
      <AuthContextProvider>
        <Page />
      </AuthContextProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'open login' }));
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(request).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('auth')).toHaveTextContent('false:false');

    await act(async () => resolveLogin({ access_token: 'token' }));

    expect(screen.getByTestId('auth')).toHaveTextContent('true:false');
    expect(onPageMount).toHaveBeenCalledTimes(1);
  });
});
