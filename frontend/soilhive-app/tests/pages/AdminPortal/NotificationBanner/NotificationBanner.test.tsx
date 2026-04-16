jest.mock('primereact/editor', () => ({
  __esModule: true,
  Editor: ({ value, onTextChange, ...props }: any) => (
    <textarea data-testid="editor" value={value} onChange={e => onTextChange && onTextChange({ htmlValue: e.target.value })} {...props} />
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
});
