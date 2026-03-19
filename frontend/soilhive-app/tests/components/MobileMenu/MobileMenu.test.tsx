import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import MobileMenu from 'components/MobileMenu/MobileMenu';
import { useAuthContext } from '../../../src/auth/AuthContextProvider';
import type { NavMenuEntry } from 'types/components';

jest.mock('react-router', () => ({
  NavLink: ({ to, children, onClick }: any) => (
    <a data-testid="mock-router-navlink" href={to} onClick={onClick}>
      {children}
    </a>
  ),
}));

jest.mock('../../../src/auth/AuthContextProvider', () => ({
  useAuthContext: jest.fn(),
}));

jest.mock('components/AccountWidget/UserAvatar/UserAvatar', () => ({
  UserAvatar: ({ className }: { className?: string }) => (
    <div data-testid="user-avatar" className={className}>
      Avatar
    </div>
  ),
}));

jest.mock('components/UI', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => <button onClick={onClick}>{children}</button>,
}));

function TestIcon({ className }: { className?: string }) {
  return (
    <svg data-testid="menu-icon" className={className}>
      icon
    </svg>
  );
}

const menuEntries: NavMenuEntry[] = [
  {
    name: 'menu.home',
    route: '/home',
    type: 'internal',
    Icon: TestIcon,
  },
  {
    name: 'menu.admin',
    route: '/admin',
    type: 'external',
    Icon: TestIcon,
  },
];

describe('Mobile menu', () => {
  const logoutMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    (useAuthContext as jest.Mock).mockReturnValue({
      isAuthenticated: true,
      user: {
        profile: {
          name: 'Super Admin',
          email: 'super.admin@local',
        },
      },
      logout: logoutMock,
      isLoading: false,
    });
  });

  it('renders authenticated user info', () => {
    const { container } = render(<MobileMenu menuEntries={menuEntries} setIsMenuOpen={jest.fn()} />);

    expect(screen.getByTestId('user-avatar')).toBeInTheDocument();
    expect(screen.getByText('Super Admin')).toBeInTheDocument();
    expect(screen.getByText('super.admin@local')).toBeInTheDocument();

    expect(container).toMatchSnapshot();
  });

  it('falls back to email when user name is missing', () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      isAuthenticated: true,
      user: {
        profile: {
          email: 'super.admin@local',
        },
      },
      logout: logoutMock,
      isLoading: false,
    });

    render(<MobileMenu menuEntries={menuEntries} setIsMenuOpen={jest.fn()} />);

    expect(screen.getAllByText('super.admin@local')).toHaveLength(2);
  });

  it('does not render account info or logout button when not authenticated', () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      isAuthenticated: false,
      user: null,
      logout: logoutMock,
      isLoading: false,
    });

    render(<MobileMenu menuEntries={menuEntries} setIsMenuOpen={jest.fn()} />);

    expect(screen.queryByTestId('user-avatar')).not.toBeInTheDocument();
    expect(screen.queryByText('Log out')).not.toBeInTheDocument();
  });

  it('renders internal and external menu entries', () => {
    render(<MobileMenu menuEntries={menuEntries} setIsMenuOpen={jest.fn()} />);

    expect(screen.getByText('menu.home')).toBeInTheDocument();
    expect(screen.getByText('menu.admin')).toBeInTheDocument();

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(screen.getAllByTestId('mock-router-navlink')).toHaveLength(1);
    expect(screen.getByTestId('mock-router-navlink')).toHaveAttribute('href', '/home');

    expect(links[1]).toHaveAttribute('href', '/admin');
    expect(links[1]).toHaveAttribute('target', '_blank');
    expect(links[1]).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('calls setIsMenuOpen(false) when internal link is clicked', () => {
    const setIsMenuOpen = jest.fn();
    render(<MobileMenu menuEntries={menuEntries} setIsMenuOpen={setIsMenuOpen} />);

    const internalLink = screen.getAllByRole('link')[0];

    fireEvent.click(internalLink);
    expect(setIsMenuOpen).toHaveBeenCalledWith(false);
  });

  it('does not call setIsMenuOpen for external link click', () => {
    const setIsMenuOpen = jest.fn();
    render(<MobileMenu menuEntries={menuEntries} setIsMenuOpen={setIsMenuOpen} />);

    const externalLink = screen.getAllByRole('link')[1];
    fireEvent.click(externalLink);

    expect(setIsMenuOpen).not.toHaveBeenCalled();
  });

  it('calls logout when logout button is clicked', () => {
    render(<MobileMenu menuEntries={menuEntries} setIsMenuOpen={jest.fn()} />);

    fireEvent.click(screen.getByText('Log out'));

    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  it('renders icons for menu entries when provided', () => {
    render(<MobileMenu menuEntries={menuEntries} setIsMenuOpen={jest.fn()} />);

    expect(screen.getAllByTestId('menu-icon')).toHaveLength(2);
  });

  it('does not render display name paragraph when both name and email are missing', () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      isAuthenticated: true,
      user: {
        profile: {},
      },
      logout: logoutMock,
      isLoading: false,
    });

    render(<MobileMenu menuEntries={menuEntries} setIsMenuOpen={jest.fn()} />);

    expect(screen.queryByText('Super Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('superadmin@local')).not.toBeInTheDocument();
    expect(screen.getByText('Log out')).toBeInTheDocument();
  });
});
