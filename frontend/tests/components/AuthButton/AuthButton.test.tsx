import { render, screen, fireEvent } from '@testing-library/react';
import { useAuthContext } from '../../../src/auth/AuthContextProvider';
import AuthButton from 'components/AuthButton/AuthButton';

jest.mock('components/UI', () => ({
  Button: ({ children, onClick }: any) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

jest.mock('../../../src/auth/AuthContextProvider', () => ({
  __esModule: true,
  useAuthContext: jest.fn(),
}));

describe('AuthButton', () => {
  const login = jest.fn();
  const logout = jest.fn();
  const defatultAuthContextValue = {
    isAuthenticated: false,
    isLoading: false,
    login,
    logout,
    authMode: 'password',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns null when authMode is 'none'", () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      ...defatultAuthContextValue,
      authMode: 'none',
    });

    const { container } = render(<AuthButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders loading state', () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      ...defatultAuthContextValue,
      isLoading: true,
    });

    render(<AuthButton />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it("renders 'Log out' when authenticated and calls logout on click", () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      ...defatultAuthContextValue,
      isAuthenticated: true,
    });

    render(<AuthButton />);

    const btn = screen.getByRole('button');
    expect(btn).toHaveTextContent('Log out');

    fireEvent.click(btn);
    expect(logout).toHaveBeenCalledTimes(1);
    expect(login).not.toHaveBeenCalled();
  });

  it("renders 'Log in' when not authenticated and calls login on click", () => {
    (useAuthContext as jest.Mock).mockReturnValue(defatultAuthContextValue);

    render(<AuthButton />);

    const btn = screen.getByRole('button');
    expect(btn).toHaveTextContent('Log in');

    fireEvent.click(btn);
    expect(login).toHaveBeenCalledTimes(1);
    expect(logout).not.toHaveBeenCalled();
  });
});
