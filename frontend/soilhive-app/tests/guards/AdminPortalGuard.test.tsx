import { render, screen } from '@testing-library/react';
import { AdminPortalGuard } from '../../src/guards/AdminPortalGuard';
import { useAuthContext } from '../../src/auth/AuthContextProvider';

jest.mock('../../src/auth/AuthContextProvider', () => ({
  useAuthContext: jest.fn(),
}));

jest.mock('react-router', () => ({
  Navigate: ({ to, replace }: { to: string; replace?: boolean }) => (
    <div data-testid="navigate">
      Navigate to: {to}, replace: {String(replace)}
    </div>
  ),
  Outlet: () => <div data-testid="outlet">Outlet content</div>,
}));

describe('AdminPortalGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders null while auth is loading', () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      user: null,
    });

    const { container } = render(<AdminPortalGuard />);

    expect(container.firstChild).toBeNull();
  });

  it('renders Navigate when user is not authenticated', () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
    });

    render(<AdminPortalGuard />);

    expect(screen.getByTestId('navigate')).toHaveTextContent('Navigate to: /');
    expect(screen.getByTestId('navigate')).toHaveTextContent('replace: true');
    expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
  });

  it('renders Outlet when user is authenticated', () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { id: '1' },
    });

    render(<AdminPortalGuard />);

    expect(screen.getByTestId('outlet')).toBeInTheDocument();
    expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
  });
});
