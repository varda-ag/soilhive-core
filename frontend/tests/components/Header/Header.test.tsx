import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import useTheme from 'hooks/useTheme';
import useDevice from 'hooks/useDevice';
import useRemotes from 'hooks/useRemotes';
import Header from 'components/Header/Header';
import { useAuthContext } from '../../../src/auth/AuthContextProvider';
import { PluginType, type NewTabPlugin, type SinglePagePlugin } from '../../../src/types/plugins';

// Header now imports the plugin type guards from moduleFederation, which spins up
// the MF host at module load. Stub the runtime so the import stays side-effect free.
jest.mock('@module-federation/enhanced/runtime', () => ({
  createInstance: jest.fn(() => ({
    registerShared: jest.fn(),
    registerRemotes: jest.fn(),
    loadRemote: jest.fn(),
  })),
}));

jest.mock('hooks/useRemotes', () => ({
  __esModule: true,
  default: jest.fn(),
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
  default: ({ menuEntries }: { menuEntries: Array<{ name: string; route?: string; type?: string }> }) => (
    <div data-testid="mobile-menu-mock">
      {menuEntries.map(item => (
        <div key={item.name} data-testid="mobile-menu-entry" data-type={item.type}>
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

const singlePagePlugin: SinglePagePlugin = {
  name: 'single-page-module',
  type: PluginType.SINGLE_PAGE,
  hasMenuItem: true,
  route: 'single-page-route',
  Page: () => null,
};

const newTabPlugin: NewTabPlugin = {
  name: 'new-tab-module',
  type: PluginType.NEW_TAB,
  hasMenuItem: true,
  targetUrl: 'https://example.com/plugin',
};

describe('Header component', () => {
  beforeEach(() => {
    (useTheme as jest.Mock).mockReturnValue({
      logo: 'logo.png',
      isLoadingThemeConfig: false,
      themeConfig: { termsAndConditionsHtml: '<div>Mock</div>', privacyPolicyHtml: '' },
    });
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: true, isMobileLayout: false });

    (useRemotes as jest.Mock).mockReturnValue({
      plugins: [singlePagePlugin, newTabPlugin],
      isLoadingRemotes: false,
    });

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

  it('renders built-in and plugin entries in the mobile menu in the same order as desktop', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: false, isMobileLayout: true });

    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <Header />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId('sh-header-hamburger'));

    // Order mirrors desktop: home, then plugins (single-page, new-tab), then legal.
    const entries = screen.getAllByTestId('mobile-menu-entry');
    expect(entries.map(entry => entry.textContent)).toEqual([
      'nav_menu.home:/',
      'single-page-module:single-page-route',
      'new-tab-module:https://example.com/plugin',
      'nav_menu.legal:',
    ]);
    // The new-tab plugin is carried as an external entry so the mobile menu opens it in a new tab.
    expect(entries[2]).toHaveAttribute('data-type', 'external');
    expect(entries[1]).toHaveAttribute('data-type', 'internal');
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
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig,
      themeConfig: { termsAndConditionsHtml: 'mock', privacyPolicyHtml: '' },
    });

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

  it('renders Legal dropdown when only privacyPolicyHtml is set', () => {
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: false,
      themeConfig: { termsAndConditionsHtml: '', privacyPolicyHtml: '<p>Privacy</p>' },
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Header />
      </MemoryRouter>,
    );

    expect(screen.queryByText('Legal')).toBeInTheDocument();
  });

  it('does not render Legal dropdown when both termsAndConditionsHtml and privacyPolicyHtml are empty', () => {
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: false,
      themeConfig: { termsAndConditionsHtml: '', privacyPolicyHtml: '' },
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Header />
      </MemoryRouter>,
    );

    expect(screen.queryByText('Legal')).not.toBeInTheDocument();
  });

  it('renders Legal dropdown with both children when both html values are set', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: false, isMobileLayout: true });
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: false,
      themeConfig: { termsAndConditionsHtml: '<p>Terms</p>', privacyPolicyHtml: '<p>Privacy</p>' },
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Header />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId('sh-header-hamburger'));

    // home, single-page plugin, new-tab plugin, legal
    const entries = screen.getAllByTestId('mobile-menu-entry');
    expect(entries).toHaveLength(4);
    expect(entries[3]).toHaveTextContent('nav_menu.legal');
  });

  it('renders only home entry in mobile menu when no legal html and no plugins', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: false, isMobileLayout: true });
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: false,
      themeConfig: { termsAndConditionsHtml: '', privacyPolicyHtml: '' },
    });
    (useRemotes as jest.Mock).mockReturnValue({ plugins: [], isLoadingRemotes: false });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Header />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId('sh-header-hamburger'));

    expect(screen.getAllByTestId('mobile-menu-entry')).toHaveLength(1);
  });

  it('renders a single-page plugin as an internal desktop nav link and a new-tab plugin as an external link', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Header />
      </MemoryRouter>,
    );

    // Single-page plugin is an internal NavLink alongside home and the legal terms child.
    const singlePageLink = screen.getByRole('link', { name: 'single-page-module' });
    expect(singlePageLink).toHaveAttribute('data-testid', 'sh-header-nav-link');
    expect(singlePageLink).not.toHaveAttribute('target');

    // New-tab plugin is a plain anchor that opens its targetUrl in a new tab.
    const externalLink = screen.getByRole('link', { name: 'new-tab-module' });
    expect(externalLink).toHaveAttribute('href', 'https://example.com/plugin');
    expect(externalLink).toHaveAttribute('target', '_blank');
    expect(externalLink).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
