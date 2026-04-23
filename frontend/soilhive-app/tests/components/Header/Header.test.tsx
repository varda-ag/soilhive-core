import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import useTheme from 'hooks/useTheme';
import useDevice from 'hooks/useDevice';
import Header from 'components/Header/Header';
import { useAuthContext } from '../../../src/auth/AuthContextProvider';

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

jest.mock('../../../src/auth/AuthContextProvider', () => ({
  useAuthContext: jest.fn(),
}));

jest.mock('components/DownloadsStatus/DownloadsStatus', () => ({
  DownloadsStatus: () => <div data-testid="downloads-status-mock">Downloads Status component</div>,
}));

jest.mock('components/MobileMenu/MobileMenu', () => ({
  __esModule: true,
  default: ({ menuEntries }: { menuEntries: Array<{ name: string; route?: string }> }) => (
    <div data-testid="mobile-menu-mock">
      {menuEntries.map(item => (
        <div key={item.name} data-testid="mobile-menu-entry">
          {item.name}:{item.route}
        </div>
      ))}
    </div>
  ),
}));

jest.mock('components/AccountWidget/AccountWidget', () => ({
  AccountWidget: () => <div data-testid="account-widget-mock">Account Widget</div>,
}));

jest.mock('components/AccountWidget/UserAvatar/UserAvatar', () => ({
  UserAvatar: ({ className }: { className?: string }) => (
    <div data-testid="user-avatar-mock" className={className}>
      User Avatar
    </div>
  ),
}));

jest.mock('components/AccountWidget/LoginButton/LoginButton', () => ({
  LoginButton: () => <div data-testid="login-button-mock">Login Button</div>,
}));

jest.mock('components/Logo/Logo', () => ({
  Logo: () => <div data-testid="sh-header-logo">Logo component</div>,
}));

describe('Header component', () => {
  beforeEach(() => {
    (useTheme as jest.Mock).mockReturnValue({
      logo: 'logo.png',
      isLoadingThemeConfig: false,
      themeConfig: { termsAndConditionsHtml: '<div>Mock</div>' },
    });
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: true, isMobileLayout: false });

    (useAuthContext as jest.Mock).mockReturnValue({
      isAuthenticated: false,
    });
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

    expect(screen.getByTestId('sh-header-nav')).toBeInTheDocument();
    expect(screen.getByTestId('downloads-status-mock')).toBeInTheDocument();
    expect(screen.getByTestId('account-widget-mock')).toBeInTheDocument();

    expect(screen.queryByTestId('login-button-mock')).not.toBeInTheDocument();
    expect(screen.queryByTestId('user-avatar-mock')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sh-header-hamburger')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mobile-menu-mock')).not.toBeInTheDocument();

    expect(screen.getAllByTestId('sh-header-nav-link')).toHaveLength(3);

    expect(container).toMatchSnapshot();
  });

  it('renders component correctly on mobile and tablets for unauthorized users', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: false, isMobileLayout: true });
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <Header />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('sh-header-logo')).toBeInTheDocument();
    expect(screen.getByTestId('downloads-status-mock')).toBeInTheDocument();
    expect(screen.getByTestId('login-button-mock')).toBeInTheDocument();
    expect(screen.getByTestId('sh-header-hamburger')).toBeInTheDocument();

    expect(screen.queryByTestId('sh-header-nav')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-widget-mock')).not.toBeInTheDocument();
    expect(screen.queryByTestId('user-avatar-mock')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mobile-menu-mock')).not.toBeInTheDocument();

    expect(container).toMatchSnapshot();
  });

  it('renders correctly on mobile for authenticated user', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: false, isMobileLayout: true });
    (useAuthContext as jest.Mock).mockReturnValue({
      isAuthenticated: true,
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Header />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId('login-button-mock')).not.toBeInTheDocument();
    expect(screen.getByTestId('user-avatar-mock')).toBeInTheDocument();
    expect(screen.getByTestId('sh-header-hamburger')).toBeInTheDocument();
  });

  it('triggers mobile menu visibility on hamburger button click', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: false, isMobileLayout: true });
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

  it('renders menu entries in the mobile menu', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: false, isMobileLayout: true });

    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <Header />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId('sh-header-hamburger'));

    expect(screen.getAllByTestId('mobile-menu-entry')).toHaveLength(2);
    expect(container).toMatchSnapshot();
  });

  it.each([
    [false, 'Beta version'],
    [true, 'Beta'],
  ])('renders BetaPill with correct text based on isMobileLayout=%s', (isMobileLayout: boolean, expectedText: string) => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: !isMobileLayout, isMobileLayout });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Header />
      </MemoryRouter>,
    );

    expect(screen.getByText(expectedText)).toBeInTheDocument();
  });

  it.each([false, true])('Conditionally renders the Legal nav link according to loading state', (isLoadingThemeConfig: boolean) => {
    (useTheme as jest.Mock).mockReturnValue({ isLoadingThemeConfig, themeConfig: { termsAndConditionsHtml: 'mock' } });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Header />
      </MemoryRouter>,
    );

    const element = screen.queryByText('Legal');
    if (isLoadingThemeConfig) {
      expect(element).not.toBeInTheDocument();
    } else {
      expect(element).toBeInTheDocument();
    }
  });
});
