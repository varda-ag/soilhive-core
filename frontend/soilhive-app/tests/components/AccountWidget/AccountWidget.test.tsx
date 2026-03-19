import { act, fireEvent, render, screen } from '@testing-library/react';
import { AccountWidget } from 'components/AccountWidget/AccountWidget';
import { useAuthContext } from '../../../src/auth/AuthContextProvider';
import { useEntitlements } from 'hooks/useEntitlementsHook';
import { useClickAway } from 'react-use';

jest.mock('react-use', () => ({
  ...jest.requireActual('react-use'),
  useClickAway: jest.fn(),
}));

jest.mock('../../../src/auth/AuthContextProvider', () => ({
  useAuthContext: jest.fn(),
}));

jest.mock('hooks/useEntitlementsHook', () => ({
  ADMIN_PORTAL_ACCESS: 0,
  useEntitlements: jest.fn(),
}));

jest.mock('components/AccountWidget/UserAvatar/UserAvatar', () => ({
  UserAvatar: ({ className }: { className?: string }) => (
    <div data-testid="user-avatar-mock" className={className}>
      UserAvatar
    </div>
  ),
}));

jest.mock('components/AccountWidget/LoginButton/LoginButton', () => ({
  LoginButton: () => <div data-testid="login-button-mock">Login Button</div>,
}));

describe('AccountWidget', () => {
  const logoutMock = jest.fn();
  let clickAwayHandler: (() => void) | null = null;

  beforeEach(() => {
    clickAwayHandler = null;

    (useClickAway as jest.Mock).mockImplementation((_ref, cb) => {
      clickAwayHandler = cb;
    });

    (useAuthContext as jest.Mock).mockReturnValue({
      isAuthenticated: true,
      user: {
        profile: {
          name: 'Super Admin',
          email: 'superadmin@local',
        },
      },
      authMode: 'password',
      isLoading: false,
      logout: logoutMock,
    });

    (useEntitlements as jest.Mock).mockReturnValue({
      can: jest.fn().mockReturnValue(false),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders null when authMode is none', () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      isAuthenticated: false,
      user: null,
      authMode: 'none',
      isLoading: false,
      logout: logoutMock,
    });

    const { container } = render(<AccountWidget />);

    expect(container.firstChild).toBeNull();
  });

  it('renders null when loading', () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      isAuthenticated: false,
      user: null,
      authMode: 'password',
      isLoading: true,
      logout: logoutMock,
    });

    const { container } = render(<AccountWidget />);

    expect(container.firstChild).toBeNull();
  });

  it('renders LoginButton when user is not authenticated', () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      isAuthenticated: false,
      user: null,
      authMode: 'password',
      isLoading: false,
      logout: logoutMock,
    });

    render(<AccountWidget />);

    expect(screen.getByTestId('login-button-mock')).toBeInTheDocument();
    expect(screen.queryByTestId('sh-ui-accountwidget')).not.toBeInTheDocument();
  });

  it('renders account widget when authenticated', () => {
    render(<AccountWidget />);

    expect(screen.getByTestId('sh-ui-accountwidget')).toBeInTheDocument();
    expect(screen.getByTestId('sh-ui-accountwidgetbutton')).toBeInTheDocument();
    expect(screen.getByTestId('user-avatar-mock')).toBeInTheDocument();
    expect(screen.queryByText('Super Admin')).not.toBeInTheDocument();
  });

  it('opens menu when widget button is clicked', () => {
    const { container } = render(<AccountWidget />);

    fireEvent.click(screen.getByTestId('sh-ui-accountwidgetbutton'));

    expect(screen.getByText('Super Admin')).toBeInTheDocument();
    expect(screen.getByText('superadmin@local')).toBeInTheDocument();
    expect(screen.getByText('Log out')).toBeInTheDocument();
    expect(screen.getAllByTestId('user-avatar-mock')).toHaveLength(2);
    expect(container).toMatchSnapshot();
  });

  it('closes menu when widget button is clicked twice', () => {
    render(<AccountWidget />);

    const button = screen.getByTestId('sh-ui-accountwidgetbutton');

    fireEvent.click(button);
    expect(screen.getByText('Super Admin')).toBeInTheDocument();

    fireEvent.click(button);
    expect(screen.queryByText('Super Admin')).not.toBeInTheDocument();
  });

  it('falls back to email when name is missing', () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      isAuthenticated: true,
      user: {
        profile: {
          email: 'superadmin@local',
        },
      },
      authMode: 'password',
      isLoading: false,
      logout: logoutMock,
    });

    render(<AccountWidget />);

    fireEvent.click(screen.getByTestId('sh-ui-accountwidgetbutton'));

    expect(screen.getAllByText('superadmin@local')).toHaveLength(2);
  });

  it('shows admin panel link when entitlement is granted', () => {
    (useEntitlements as jest.Mock).mockReturnValue({
      can: () => true,
    });

    render(<AccountWidget />);

    fireEvent.click(screen.getByTestId('sh-ui-accountwidgetbutton'));

    const adminLink = screen.getByRole('link', { name: /Admin Console/i });
    expect(adminLink).toHaveAttribute('href', '/adminportal');
    expect(adminLink).toHaveAttribute('target', '_blank');
    expect(adminLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('does not show admin panel link when entitlement is not granted', () => {
    render(<AccountWidget />);

    fireEvent.click(screen.getByTestId('sh-ui-accountwidgetbutton'));

    expect(screen.queryByRole('link', { name: /Admin Console/i })).not.toBeInTheDocument();
  });

  it('calls logout when logout option is clicked', () => {
    render(<AccountWidget />);

    fireEvent.click(screen.getByTestId('sh-ui-accountwidgetbutton'));
    fireEvent.click(screen.getByText('Log out'));

    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  it('closes menu on click away when menu is open', () => {
    render(<AccountWidget />);

    fireEvent.click(screen.getByTestId('sh-ui-accountwidgetbutton'));
    expect(screen.getByText('Super Admin')).toBeInTheDocument();

    expect(clickAwayHandler).toBeTruthy();

    act(() => {
      clickAwayHandler?.();
    });

    expect(screen.queryByText('Super Admin')).not.toBeInTheDocument();
  });

  it('does not fail on click away when menu is closed', () => {
    render(<AccountWidget />);

    expect(clickAwayHandler).toBeTruthy();

    act(() => {
      clickAwayHandler?.();
    });

    expect(screen.queryByText('Super Admin')).not.toBeInTheDocument();
  });
});
