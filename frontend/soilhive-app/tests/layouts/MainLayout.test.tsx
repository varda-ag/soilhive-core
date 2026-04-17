import { render, screen } from '@testing-library/react';
import { MainLayout } from '../../src/layouts/MainLayout/MainLayout';
import useTheme from 'hooks/useTheme';

jest.mock('hooks/useTheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('components/Header/Header', () => ({
  __esModule: true,
  default: () => <div data-testid="header">Header</div>,
}));

jest.mock('react-router', () => ({
  Outlet: () => <div data-testid="outlet" />,
}));

jest.mock('components/NotificationBanner/NotificationBanner', () => ({
  NotificationBanner: () => <div>NotificationBanner mock</div>,
}));

describe('MainLayout', () => {
  beforeEach(() => {
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: false,
      themeConfig: { notificationBannerHtml: '' },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders MainLayout and matches the snapshot', () => {
    const { container } = render(<MainLayout />);

    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('outlet')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('does not render notification banner while theme config is loading', () => {
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: true,
      themeConfig: { notificationBannerHtml: '<p>Hello</p>' },
    });
    render(<MainLayout />);
    expect(screen.queryByText('NotificationBanner mock')).not.toBeInTheDocument();
  });

  it('does not render notification banner when notificationBannerHtml is empty', () => {
    render(<MainLayout />);
    expect(screen.queryByText('NotificationBanner mock')).not.toBeInTheDocument();
  });

  it('renders notification banner when notificationBannerHtml has content', () => {
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: false,
      themeConfig: { notificationBannerHtml: '<p>Important notice</p>' },
    });
    render(<MainLayout />);
    expect(screen.getByText('NotificationBanner mock')).toBeInTheDocument();
  });
});
