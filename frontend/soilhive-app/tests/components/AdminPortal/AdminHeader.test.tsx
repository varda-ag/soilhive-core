import { render, screen } from '@testing-library/react';
import { AdminHeader } from 'components/AdminPortal/AdminHeader/AdminHeader';
import { useLocation } from 'react-router';
import useTheme from 'hooks/useTheme';

jest.mock('react-router', () => ({
  useLocation: jest.fn(),
}));

jest.mock('hooks/useTheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe('AdminHeader', () => {
  beforeEach(() => {
    (useLocation as jest.Mock).mockReturnValue({
      pathname: '/adminportal/terms-and-conditions',
    });

    (useTheme as jest.Mock).mockReturnValue({
      logo: 'https://example.com/logo.png',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders header and matches snapshot', () => {
    const { container } = render(<AdminHeader />);

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
