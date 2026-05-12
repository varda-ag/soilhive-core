import { render, screen } from '@testing-library/react';
import { UserAvatar } from 'components/AccountWidget/UserAvatar/UserAvatar';
import { useAuthContext } from '../../../src/auth/AuthContextProvider';

jest.mock('../../../src/auth/AuthContextProvider', () => ({
  useAuthContext: jest.fn(),
}));

describe('UserAvatar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders initials from given_name and family_name', () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      user: {
        profile: {
          given_name: 'Super',
          family_name: 'Admin',
        },
      },
    });

    render(<UserAvatar />);

    expect(screen.getByTestId('sh-ui-useravatar')).toBeInTheDocument();
    expect(screen.getByText('SA')).toBeInTheDocument();
  });

  it('falls back to first character of name', () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      user: {
        profile: {
          name: 'Admin',
        },
      },
    });

    render(<UserAvatar />);

    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('falls back to first character of email', () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      user: {
        profile: {
          email: 'super.admin@local',
        },
      },
    });

    render(<UserAvatar />);

    expect(screen.getByText('s')).toBeInTheDocument();
  });

  it('accepts custom className', () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      user: {
        profile: {
          email: 'super.admin@local',
        },
      },
    });

    render(<UserAvatar className="CustomClass" />);

    expect(screen.getByTestId('sh-ui-useravatar')).toHaveClass('CustomClass');
  });

  it('renders empty placeholder when user profile is missing', () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      user: null,
    });

    render(<UserAvatar />);

    expect(screen.getByTestId('sh-ui-useravatar')).toBeInTheDocument();
    expect(screen.getByTestId('sh-ui-useravatar').textContent).toBe('');
  });
});
