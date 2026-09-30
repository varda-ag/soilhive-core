import { render } from '@testing-library/react';
import { AuthContextProvider, useAuthContext } from '../../src/auth/AuthContextProvider';
import { useApiQuery } from 'hooks/useApiQuery';

jest.mock('hooks/useApiQuery', () => ({
  useApiQuery: jest.fn(),
}));

describe('NoAuthProvider', () => {
  it('reports nobody as signed in on a deployment with no identity system', () => {
    (useApiQuery as jest.Mock).mockReturnValue({ data: { authMode: 'none' }, isLoading: false });
    const AuthState = () => {
      const { authMode, isAuthenticated } = useAuthContext();
      return <span data-testid="auth">{`${authMode}:${isAuthenticated}`}</span>;
    };

    const { getByTestId } = render(
      <AuthContextProvider>
        <AuthState />
      </AuthContextProvider>,
    );

    expect(getByTestId('auth')).toHaveTextContent('none:false');
  });
});
