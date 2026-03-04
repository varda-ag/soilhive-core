import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import useTheme from 'hooks/useTheme';
import useDevice from 'hooks/useDevice';
import Header from 'components/Header/Header';

jest.mock('../../../src/utilities/moduleFederation', () => ({
  singlePages: [
    {
      name: 'test-module-name',
      route: 'test-module-route',
    },
  ],
}));

jest.mock('hooks/useTheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('hooks/useDevice', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('components/DownloadsStatus/DownloadsStatus', () => ({
  DownloadsStatus: () => <div data-testid="downloads-status-mock">Downloads Status component</div>,
}));

jest.mock('components/MobileMenu/MobileMenu', () => ({
  __esModule: true,
  default: () => <div data-testid="mobile-menu-mock">Mobile Menu component</div>,
}));

jest.mock('components/AuthButton/AuthButton', () => ({
  __esModule: true,
  default: () => <div data-testid="auth-button-mock">Auth Button component</div>,
}));

describe('Header component', () => {
  beforeEach(() => {
    (useTheme as jest.Mock).mockReturnValue({
      logo: 'logo.png',
    });
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: true });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders component correctly on desktop', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <Header />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('sh-header-logo')).toBeInTheDocument();

    const image = screen.getByAltText('Logo');
    expect((image as HTMLImageElement).src).toContain('logo.png');

    expect(screen.getByTestId('sh-header-nav')).toBeInTheDocument();
    expect(screen.getByTestId('downloads-status-mock')).toBeInTheDocument();
    expect(screen.getByTestId('auth-button-mock')).toBeInTheDocument();
    expect(screen.queryByTestId('sh-header-hamburger')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mobile-menu-mock')).not.toBeInTheDocument();

    expect(container).toMatchSnapshot();
  });

  it('renders component correctly on mobile and tablets', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: false });
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <Header />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('sh-header-logo')).toBeInTheDocument();
    expect(screen.queryByTestId('sh-header-nav')).not.toBeInTheDocument();
    expect(screen.getByTestId('downloads-status-mock')).toBeInTheDocument();
    expect(screen.getByTestId('auth-button-mock')).toBeInTheDocument();
    expect(screen.getByTestId('sh-header-hamburger')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-menu-mock')).not.toBeInTheDocument();

    expect(container).toMatchSnapshot();
  });

  it('triggers mobile menu visibility on hamburger button click', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: false });
    render(
      <MemoryRouter initialEntries={['/']}>
        <Header />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId('mobile-menu-mock')).not.toBeInTheDocument();
    const hamburgerButton = screen.getByTestId('sh-header-hamburger');

    act(() => {
      fireEvent.click(hamburgerButton);
    });

    expect(screen.getByTestId('mobile-menu-mock')).toBeInTheDocument();

    act(() => {
      fireEvent.click(hamburgerButton);
    });

    expect(screen.queryByTestId('mobile-menu-mock')).not.toBeInTheDocument();
  });
});
