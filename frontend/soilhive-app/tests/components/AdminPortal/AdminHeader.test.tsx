import { render, screen } from '@testing-library/react';
import { AdminHeader } from 'components/AdminPortal/AdminHeader/AdminHeader';
import { useLocation } from 'react-router';
import useTheme from 'hooks/useTheme';
import { useAuthContext } from '../../../src/auth/AuthContextProvider';
import { ADMIN_ROOT } from '../../../src/configuration/admin';

jest.mock('react-router', () => ({
  useLocation: jest.fn(),
}));

jest.mock('hooks/useTheme', () => ({
  __esModule: true,
  default: jest.fn(),
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

describe('AdminHeader', () => {
  beforeEach(() => {
    (useLocation as jest.Mock).mockReturnValue({
      pathname: `${ADMIN_ROOT}/terms-and-conditions`,
    });

    (useTheme as jest.Mock).mockReturnValue({
      logo: 'https://example.com/logo.png',
    });

    (useAuthContext as jest.Mock).mockReturnValue({
      user: {
        profile: {
          email: 'test@example.com',
        },
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders header and matches snapshot', () => {
    const { container } = render(<AdminHeader />);

    expect(screen.getByTestId('user-avatar-mock')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('renders logo image when logo exists', () => {
    render(<AdminHeader />);

    const logo = screen.getByAltText('Logo');
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute('src', 'https://example.com/logo.png');
  });

  it('does not render logo image when logo is missing', () => {
    (useTheme as jest.Mock).mockReturnValue({
      logo: '',
    });

    render(<AdminHeader />);

    expect(screen.queryByAltText('Logo')).not.toBeInTheDocument();
  });
});
