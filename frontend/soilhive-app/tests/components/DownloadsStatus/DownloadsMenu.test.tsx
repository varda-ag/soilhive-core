import { render, screen, fireEvent } from '@testing-library/react';
import { DownloadsMenu } from 'components/DownloadsStatus/DownloadsMenu/DownloadsMenu';
import useDownloads from 'hooks/useDownloads';

jest.mock('hooks/useDownloads', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('components/DownloadsStatus/DownloadsMenu/DownloadsMenuItem/DownloadsMenuItem', () => ({
  DownloadsMenuItem: ({ progress, onCancel }: any) => (
    <div data-testid="downloads-menu-item">
      <span data-testid="downloads-menu-item-progress">{progress}</span>
      <button data-testid="downloads-menu-item-cancel" onClick={onCancel}>
        cancel
      </button>
    </div>
  ),
}));

describe('DownloadsMenu', () => {
  const mockCancelDownload = jest.fn();

  beforeEach(() => {
    (useDownloads as jest.Mock).mockReturnValue({
      downloads: [
        { id: '1', progress: 85 },
        { id: '2', progress: 53 },
      ],
      cancelDownload: mockCancelDownload,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders compenent with downloads count and downloads items', () => {
    const { container } = render(<DownloadsMenu />);

    const downloadsItems = screen.getAllByTestId('downloads-menu-item');

    expect(screen.getByTestId('sh-downloads-menu')).toBeInTheDocument();
    expect(screen.getByText('2 downloads in progress')).toBeInTheDocument();
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
});
