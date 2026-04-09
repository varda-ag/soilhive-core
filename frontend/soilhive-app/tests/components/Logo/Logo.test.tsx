import { render, screen } from '@testing-library/react';
import { Logo } from 'components/Logo/Logo';

import useTheme from 'hooks/useTheme';

jest.mock('hooks/useTheme', jest.fn);
jest.mock('assets/images/soil-hive-logo.svg', () => 'default-logo.svg');

describe('Logo', () => {
  beforeEach(() => {
    (useTheme as jest.Mock).mockReturnValue({
      logo: null,
      isLogoLoading: false,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders default logo and matches snapshot', () => {
    const { container } = render(<Logo />);

    const img = screen.getByRole('img');

    expect(screen.getByTestId('sh-logo')).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'default-logo.svg');
    expect(img).toHaveAttribute('alt', 'Logo');
    expect(container).toMatchSnapshot();
  });

  it('renders custom logo when provided', () => {
    (useTheme as jest.Mock).mockReturnValue({
      logo: 'custom-logo.png',
      isLogoLoading: false,
    });

    render(<Logo />);

    const img = screen.getByRole('img');

    expect(img).toHaveAttribute('src', 'custom-logo.png');
  });

  it('does not render image while loading', () => {
    (useTheme as jest.Mock).mockReturnValue({
      logo: 'custom-logo.png',
      isLogoLoading: true,
    });

    render(<Logo />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<Logo className="custom-class" />);

    expect(screen.getByTestId('sh-logo')).toHaveClass('custom-class');
  });
});
