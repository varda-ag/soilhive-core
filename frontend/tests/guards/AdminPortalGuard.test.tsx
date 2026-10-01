import { render, screen } from '@testing-library/react';
import { AdminPortalGuard } from '../../src/guards/AdminPortalGuard';
import { useAuthContext } from '../../src/auth/AuthContextProvider';
import { ADMIN_PORTAL_ACCESS, useEntitlements } from 'hooks/useEntitlementsHook';

jest.mock('../../src/auth/AuthContextProvider', () => ({
  useAuthContext: jest.fn(),
}));

jest.mock('components/Header/Header', () => ({
  __esModule: true,
  default: () => <div data-testid="header">Header</div>,
}));

jest.mock('components/SignInPrompt/SignInPrompt', () => ({
  SignInPrompt: ({ title }: { title: string }) => <div data-testid="sign-in-prompt">{title}</div>,
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
      isAuthenticated: true,
      authMode: 'oidc',
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

  it('asks an anonymous visitor to sign in instead of redirecting', () => {
    (useAuthContext as jest.Mock).mockReturnValue({ isLoading: false, isAuthenticated: false, authMode: 'oidc' });
    (useEntitlements as jest.Mock).mockReturnValue({ can: () => false });

    render(<AdminPortalGuard />);

    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('sign-in-prompt')).toBeInTheDocument();
    expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
    expect(screen.queryByTestId('admin-portal-layout')).not.toBeInTheDocument();
  });

  it('redirects home on a deployment with no sign-in', () => {
    (useAuthContext as jest.Mock).mockReturnValue({ isLoading: false, isAuthenticated: false, authMode: 'none' });
    (useEntitlements as jest.Mock).mockReturnValue({ can: () => false });

    render(<AdminPortalGuard />);

    expect(screen.getByTestId('navigate')).toHaveTextContent('Navigate to: /');
    expect(screen.queryByTestId('sign-in-prompt')).not.toBeInTheDocument();
  });
});
