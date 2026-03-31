import { fireEvent, render, screen } from '@testing-library/react';
import { AdminHeader } from 'components/AdminPortal/AdminHeader/AdminHeader';
import { useLocation, useNavigate } from 'react-router';
import { useAuthContext } from '../../../src/auth/AuthContextProvider';
import { ADMIN_ROOT } from '../../../src/configuration/admin';

jest.mock('react-router', () => ({
  useLocation: jest.fn(),
  useNavigate: jest.fn(),
}));

jest.mock('../../../src/auth/AuthContextProvider', () => ({
  useAuthContext: jest.fn(),
}));

jest.mock('components/AccountWidget/UserAvatar/UserAvatar', () => ({
  UserAvatar: ({ className }: { className?: string }) => (
    <div data-testid="user-avatar-mock" className={className}>
      User Avatar
    </div>
  ),
}));

jest.mock('components/Logo/Logo', () => ({
  Logo: () => <div data-testid="sh-header-logo">Logo component</div>,
}));

describe('AdminHeader', () => {
  const mockNavigate = jest.fn();
  const mockLogout = jest.fn();

  beforeEach(() => {
    (useNavigate as jest.Mock).mockReturnValue(mockNavigate);
    (useLocation as jest.Mock).mockReturnValue({
      pathname: `${ADMIN_ROOT}/terms-and-conditions`,
    });

    (useAuthContext as jest.Mock).mockReturnValue({
      user: {
        profile: {
          email: 'test@example.com',
        },
      },
      logout: mockLogout,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders header and matches snapshot', () => {
    const { container } = render(<AdminHeader />);

    expect(screen.getByTestId('sh-header-logo')).toBeInTheDocument();
    expect(screen.getByTestId('user-avatar-mock')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('calls logout and navigates to homepage on logout click', () => {
    render(<AdminHeader />);

    fireEvent.click(screen.getByTestId('sh-header-logout'));

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
