import { render, screen } from '@testing-library/react';

jest.mock('../../../src/auth/AuthContextProvider', () => ({
  useAuthContext: jest.fn(),
}));
import { useAuthContext } from '../../../src/auth/AuthContextProvider';

jest.mock('../../../src/utilities/moduleFederation', () => ({
  singlePages: [],
}));

jest.mock('../../../src/hooks/useTheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));
import useTheme from '../../../src/hooks/useTheme';

import Header from 'components/Header/Header';

jest.mock('react-router', () => ({
  NavLink: ({ to, children }: any) => <a href={to}>{children}</a>,
}));

jest.mock('assets/icons/small-user-icon.svg?react', () => ({
  __esModule: true,
  default: () => <svg data-testid="user-icon" />,
}));

describe('Header component', () => {
  it('snapshot with authenticated user', () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      login: jest.fn(),
      logout: jest.fn(),
    });

    const mockUseTheme = useTheme as jest.Mock;
    mockUseTheme.mockReturnValue({
      logo: 'logo.png',
    });

    const { container } = render(<Header />);
    const btn = screen.getByTestId('sh-ui-button');
    expect(btn).toHaveTextContent('Log out');
    expect(container).toMatchSnapshot();
  });

  it('renders hamburger menu button', () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      login: jest.fn(),
      logout: jest.fn(),
    });

    const mockUseTheme = useTheme as jest.Mock;
    mockUseTheme.mockReturnValue({
      logo: 'logo.png',
    });

    render(<Header />);

    const hamburger = screen.getByRole('button', { name: /menu/i });
    expect(hamburger).toBeInTheDocument();
  });
});
