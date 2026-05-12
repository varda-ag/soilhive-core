jest.mock('primereact/editor', () => ({
  __esModule: true,
  Editor: ({ value, onTextChange, ...props }: any) => (
    <textarea
      data-testid="editor"
      value={value}
      onChange={e => onTextChange && onTextChange({ htmlValue: e.target.value, textValue: e.target.value })}
      {...props}
    />
  ),
}));

jest.mock('../../../../src/components/UI', () => ({
  __esModule: true,
  Button: ({ onClick, children }: any) => <button onClick={onClick}>{children}</button>,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { render, fireEvent } from '@testing-library/react';
import useTheme from 'hooks/useTheme';
import { NotificationBanner } from '../../../../src/pages/AdminPortal/NotificationBanner/NotificationBanner';

jest.mock('hooks/useTheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe('NotificationBanner page', () => {
  it('matches snapshot', () => {
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: false,
      themeConfig: { notificationBannerHtml: 'mock' },
    });
    const { container } = render(<NotificationBanner />);
    expect(container).toMatchSnapshot();
  });

  it('renders Skeleton when loading', () => {
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: true,
      themeConfig: { notificationBannerHtml: 'mock' },
    });
    const { container } = render(<NotificationBanner />);
    expect(container.querySelector('.react-loading-skeleton')).toBeTruthy();
  });

  it('editor initializes with themeConfig value', () => {
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: false,
      themeConfig: { notificationBannerHtml: 'initial' },
    });
    const { getByTestId } = render(<NotificationBanner />);
    const editor = getByTestId('editor') as HTMLTextAreaElement;
    expect(editor.value).toBe('initial');
  });

  it('updates html state when Editor changes', () => {
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: false,
      themeConfig: { notificationBannerHtml: 'initial' },
    });
    const { getByTestId } = render(<NotificationBanner />);
    const editor = getByTestId('editor') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: 'changed' } });
    expect(editor.value).toBe('changed');
  });

  it('calls saveNotificationBanner with updated html', () => {
    const saveNotificationBanner = jest.fn();
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: false,
      themeConfig: { notificationBannerHtml: 'initial' },
      saveNotificationBanner,
    });
    const { getByTestId, getByText } = render(<NotificationBanner />);
    const editor = getByTestId('editor') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: 'changed' } });
    const saveButton = getByText('notification_banner.save');
    fireEvent.click(saveButton);
    expect(saveNotificationBanner).toHaveBeenCalledWith('changed');
  });

  it('shows correct initial counter value', () => {
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: false,
      themeConfig: { notificationBannerHtml: 'hello' },
    });
    const { getByText } = render(<NotificationBanner />);
    expect(getByText('495 notification_banner.symbols_left')).toBeTruthy();
  });

  it('counter updates when editor content changes', () => {
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: false,
      themeConfig: { notificationBannerHtml: '' },
    });
    const { getByTestId, getByText } = render(<NotificationBanner />);
    fireEvent.change(getByTestId('editor'), { target: { value: 'hi' } });
    expect(getByText('498 notification_banner.symbols_left')).toBeTruthy();
  });

  it('counter does not show error class when under limit', () => {
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: false,
      themeConfig: { notificationBannerHtml: 'short' },
    });
    const { container } = render(<NotificationBanner />);
    expect(container.querySelector('[class*="CounterError"]')).toBeNull();
  });

  it('counter shows error class when over 500 characters', () => {
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: false,
      themeConfig: { notificationBannerHtml: '' },
    });
    const { getByTestId, container } = render(<NotificationBanner />);
    fireEvent.change(getByTestId('editor'), { target: { value: 'a'.repeat(501) } });
    expect(container.querySelector('[class*="CounterError"]')).toBeTruthy();
  });
});
