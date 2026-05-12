import { render, screen } from '@testing-library/react';
import { AdminPortalGuard } from '../../src/guards/AdminPortalGuard';
import { useAuthContext } from '../../src/auth/AuthContextProvider';
import { ADMIN_PORTAL_ACCESS, useEntitlements } from 'hooks/useEntitlementsHook';

jest.mock('../../src/auth/AuthContextProvider', () => ({
  useAuthContext: jest.fn(),
}));

jest.mock('../../src/layouts', () => ({
  AdminPortalLayout: () => <div data-testid="admin-portal-layout">AdminPortalLayout</div>,
}));

jest.mock('hooks/useEntitlementsHook', () => ({
  __esModule: true,
  ADMIN_PORTAL_ACCESS: 0,
  useEntitlements: jest.fn(),
}));

jest.mock('react-router', () => ({
  Navigate: ({ to, replace }: { to: string; replace?: boolean }) => (
    <div data-testid="navigate">
      Navigate to: {to}, replace: {String(replace)}
    </div>
  ),
}));

describe('AdminPortalGuard', () => {
  beforeEach(() => {
    (useEntitlements as jest.Mock).mockReturnValue({
      can: (permission: number) => {
        if (permission === ADMIN_PORTAL_ACCESS) return true;
        return false;
      },
    });

    (useAuthContext as jest.Mock).mockReturnValue({
      isLoading: false,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders null while auth is loading', () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      isLoading: true,
    });

    const { container } = render(<AdminPortalGuard />);

    expect(container.firstChild).toBeNull();
  });

  it('renders Navigate when user is not authorized to access the admin portal', () => {
    (useEntitlements as jest.Mock).mockReturnValue({
      can: (permission: number) => {
        if (permission === ADMIN_PORTAL_ACCESS) return false;
        return false;
      },
    });
    render(<AdminPortalGuard />);

    expect(screen.getByTestId('navigate')).toHaveTextContent('Navigate to: /');
    expect(screen.getByTestId('navigate')).toHaveTextContent('replace: true');
    expect(screen.queryByTestId('admin-portal-layout')).not.toBeInTheDocument();
  });

  it('renders AdminPortalLayout when user is authorized to access the admin portal', () => {
    render(<AdminPortalGuard />);

    expect(screen.getByTestId('admin-portal-layout')).toBeInTheDocument();
    expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
  });
});
