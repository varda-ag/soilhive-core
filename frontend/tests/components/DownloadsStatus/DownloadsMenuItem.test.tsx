import { render, screen, fireEvent } from '@testing-library/react';
import { DownloadsMenuItem } from 'components/DownloadsStatus/DownloadsMenu/DownloadsMenuItem/DownloadsMenuItem';
import type { DownloadsItem } from '../../../src/contexts/DownloadsContext';

jest.mock('primereact/confirmpopup', () => ({
  ConfirmPopup: (props: any) => {
    return (
      <div data-testid="confirm-popup" data-visible={String(!!props.visible)}>
        <div data-testid="confirm-message">{props.message}</div>
        <button type="button" data-testid="confirm-accept" onClick={() => props.accept?.()}>
          accept
        </button>
        <button type="button" data-testid="confirm-hide" onClick={() => props.onHide?.()}>
          hide
        </button>
      </div>
    );
  },
}));

const item = (overrides: Partial<DownloadsItem> = {}): DownloadsItem => ({
  id: 'job-1',
  status: 'active',
  progress: 10,
  createdAt: '2026-10-21T10:00:00.000Z',
  formats: ['csv', 'tiff'],
  datasetCount: 3,
  ...overrides,
});

const renderItem = (
  overrides: Partial<DownloadsItem> = {},
  handlers: Partial<Record<'onCancel' | 'onDownload' | 'onRemove', jest.Mock>> = {},
) => render(<DownloadsMenuItem item={item(overrides)} onCancel={jest.fn()} onDownload={jest.fn()} onRemove={jest.fn()} {...handlers} />);

describe('DownloadsMenuItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a running Export with its progress and formats', () => {
    renderItem({ progress: 42 });

    expect(screen.getByTestId('sh-downloads-menu-item')).toHaveAttribute('data-status', 'active');
    expect(screen.getByText('42 %')).toBeInTheDocument();
    // The i18n test mock neither pluralises nor interpolates
    expect(screen.getByText('CSV, TIFF · downloads_status.datasets_count')).toBeInTheDocument();
    expect(screen.getByTestId('sh-downloads-menu-item-cancel')).toBeInTheDocument();
    expect(screen.queryByTestId('sh-downloads-menu-item-download')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sh-downloads-menu-item-remove')).not.toBeInTheDocument();
  });

  it('opens ConfirmPopup when Cancel button is clicked', () => {
    renderItem();

    expect(screen.getByTestId('confirm-popup')).toHaveAttribute('data-visible', 'false');

    fireEvent.click(screen.getByTestId('sh-downloads-menu-item-cancel'));

    expect(screen.getByTestId('confirm-popup')).toHaveAttribute('data-visible', 'true');
  });

  it('hides ConfirmPopup when onHide is called', () => {
    renderItem();

    fireEvent.click(screen.getByTestId('sh-downloads-menu-item-cancel'));
    expect(screen.getByTestId('confirm-popup')).toHaveAttribute('data-visible', 'true');

    fireEvent.click(screen.getByTestId('confirm-hide'));
    expect(screen.getByTestId('confirm-popup')).toHaveAttribute('data-visible', 'false');
  });

  it('calls onCancel when accept is clicked', () => {
    const onCancel = jest.fn();
    renderItem({}, { onCancel });

    fireEvent.click(screen.getByTestId('sh-downloads-menu-item-cancel'));
    fireEvent.click(screen.getByTestId('confirm-accept'));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('offers download and remove for a completed Export, without cancel', () => {
    const onDownload = jest.fn();
    const onRemove = jest.fn();
    renderItem({ status: 'completed', progress: 100 }, { onDownload, onRemove });

    expect(screen.queryByTestId('sh-downloads-menu-item-cancel')).not.toBeInTheDocument();
    expect(screen.queryByText('100 %')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('sh-downloads-menu-item-download'));
    fireEvent.click(screen.getByTestId('sh-downloads-menu-item-remove'));

    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('shows the error of a failed Export and only offers remove', () => {
    const onRemove = jest.fn();
    renderItem({ status: 'failed', message: 'Too many records.' }, { onRemove });

    expect(screen.getByTestId('sh-downloads-menu-item-error')).toHaveTextContent('Too many records.');
    expect(screen.queryByTestId('sh-downloads-menu-item-download')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sh-downloads-menu-item-cancel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('sh-downloads-menu-item-remove'));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('falls back to a generic error for a failed Export without a message', () => {
    renderItem({ status: 'failed' });

    expect(screen.getByTestId('sh-downloads-menu-item-error')).toHaveTextContent('Export failed');
  });
});
