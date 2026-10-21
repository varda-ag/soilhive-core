import { render, screen, fireEvent } from '@testing-library/react';
import { DownloadsMenu } from 'components/DownloadsStatus/DownloadsMenu/DownloadsMenu';
import useDownloads from 'hooks/useDownloads';

jest.mock('hooks/useDownloads', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('components/DownloadsStatus/DownloadsMenu/DownloadsMenuItem/DownloadsMenuItem', () => ({
  DownloadsMenuItem: ({ item, onCancel, onDownload, onRemove }: any) => (
    <div data-testid="downloads-menu-item">
      <span data-testid="downloads-menu-item-progress">{item.progress}</span>
      <button data-testid="downloads-menu-item-cancel" onClick={onCancel}>
        cancel
      </button>
      <button data-testid="downloads-menu-item-download" onClick={onDownload}>
        download
      </button>
      <button data-testid="downloads-menu-item-remove" onClick={onRemove}>
        remove
      </button>
    </div>
  ),
}));

const item = (id: string, status: string, progress = 0) => ({
  id,
  status,
  progress,
  createdAt: '2026-10-21T10:00:00.000Z',
  formats: ['csv'],
  datasetCount: 1,
});

describe('DownloadsMenu', () => {
  const mockCancelDownload = jest.fn();
  const mockDownloadBundle = jest.fn();
  const mockRemoveDownload = jest.fn();
  const mockClearFinished = jest.fn();

  const mockDownloads = (downloads: ReturnType<typeof item>[]) =>
    (useDownloads as jest.Mock).mockReturnValue({
      downloads,
      cancelDownload: mockCancelDownload,
      downloadBundle: mockDownloadBundle,
      removeDownload: mockRemoveDownload,
      clearFinished: mockClearFinished,
    });

  beforeEach(() => {
    mockDownloads([item('1', 'active', 85), item('2', 'active', 53)]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders compenent with title and downloads items', () => {
    const { container } = render(<DownloadsMenu />);

    const downloadsItems = screen.getAllByTestId('downloads-menu-item');

    expect(screen.getByTestId('sh-downloads-menu')).toBeInTheDocument();
    expect(screen.getByText('Downloads')).toBeInTheDocument();
    expect(downloadsItems).toHaveLength(2);
    expect(container).toMatchSnapshot();
  });

  it('applies optional className', () => {
    render(<DownloadsMenu className="extra-class" />);

    expect(screen.getByTestId('sh-downloads-menu')).toHaveClass('DownloadsMenu', 'extra-class');
  });

  it('calls cancelDownload with correct id when item cancel is clicked', () => {
    render(<DownloadsMenu />);

    const cancelButtons = screen.getAllByTestId('downloads-menu-item-cancel');
    fireEvent.click(cancelButtons[0]);

    expect(mockCancelDownload).toHaveBeenCalledTimes(1);
    expect(mockCancelDownload).toHaveBeenCalledWith('1');
  });

  it('calls downloadBundle and removeDownload with the item id', () => {
    mockDownloads([item('done', 'completed', 100)]);
    render(<DownloadsMenu />);

    fireEvent.click(screen.getByTestId('downloads-menu-item-download'));
    fireEvent.click(screen.getByTestId('downloads-menu-item-remove'));

    expect(mockDownloadBundle).toHaveBeenCalledWith('done');
    expect(mockRemoveDownload).toHaveBeenCalledWith('done');
  });

  it('hides "Clear finished" while nothing has finished, and shows the extraction message', () => {
    render(<DownloadsMenu />);

    expect(screen.queryByTestId('sh-downloads-menu-clear')).not.toBeInTheDocument();
    expect(screen.getByText('After extraction, data will be saved to your downloads folder.')).toBeInTheDocument();
  });

  it('clears finished Exports from the header', () => {
    mockDownloads([item('1', 'active', 10), item('2', 'failed')]);
    render(<DownloadsMenu />);

    fireEvent.click(screen.getByTestId('sh-downloads-menu-clear'));

    expect(mockClearFinished).toHaveBeenCalledTimes(1);
  });

  it('omits the extraction message when every Export has finished', () => {
    mockDownloads([item('1', 'completed', 100), item('2', 'failed')]);
    render(<DownloadsMenu />);

    expect(screen.getByTestId('sh-downloads-menu-clear')).toBeInTheDocument();
    expect(screen.queryByText('After extraction, data will be saved to your downloads folder.')).not.toBeInTheDocument();
  });
});
