import { render, screen, fireEvent } from '@testing-library/react';
import { useAuthContext } from '../../../src/auth/AuthContextProvider';
import { LoginButton } from 'components/AccountWidget/LoginButton/LoginButton';

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

describe('LoginButton', () => {
  const login = jest.fn();
  const defatultAuthContextValue = {
    isLoading: false,
    login,
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

    const { container } = render(<LoginButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it('returns null when isLoading is true', () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      ...defatultAuthContextValue,
      isLoading: true,
    });

    const { container } = render(<LoginButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders 'Log in' when not authenticated and calls login on click", () => {
    (useAuthContext as jest.Mock).mockReturnValue(defatultAuthContextValue);

    render(<LoginButton />);

    const btn = screen.getByRole('button');
    expect(btn).toHaveTextContent('Log in');

    fireEvent.click(btn);
    expect(login).toHaveBeenCalledTimes(1);
  });
});
