import { render, screen, fireEvent, act } from '@testing-library/react';
import { useClickAway } from 'react-use';
import { DownloadsStatus } from 'components/DownloadsStatus/DownloadsStatus';
import useDownloads from 'hooks/useDownloads';

jest.mock('components/DownloadsStatus/DownloadsMenu/DownloadsMenu', () => ({
  DownloadsMenu: ({ className }: { className?: string }) => (
    <div data-testid="mock-downloads-menu" className={className}>
      Menu
    </div>
  ),
}));

jest.mock('hooks/useDownloads', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('react-use', () => ({
  ...jest.requireActual('react-use'),
  useClickAway: jest.fn(),
}));

describe('DownloadsStatus', () => {
  let clickAwayHandler: (() => void) | null = null;

  beforeEach(() => {
    clickAwayHandler = null;

    (useClickAway as jest.Mock).mockImplementation((_ref, cb) => {
      clickAwayHandler = cb;
    });

    (useDownloads as jest.Mock).mockReturnValue({
      downloads: [{ id: '1', progress: 10 }],
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when there are no downloads', () => {
    (useDownloads as jest.Mock).mockReturnValue({ downloads: [] });

    const { container } = render(<DownloadsStatus />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders component with closed menu', () => {
    const { container } = render(<DownloadsStatus />);

    expect(screen.getByTestId('sh-downloads-status')).toBeInTheDocument();
    expect(screen.getByTestId('sh-downloads-status-button')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-downloads-menu')).not.toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('toggles menu open/close on button click', () => {
    const { container } = render(<DownloadsStatus />);

    const btn = screen.getByTestId('sh-downloads-status-button');

    expect(screen.queryByTestId('mock-downloads-menu')).not.toBeInTheDocument();

    fireEvent.click(btn);
    expect(screen.getByTestId('mock-downloads-menu')).toBeInTheDocument();
    expect(container).toMatchSnapshot();

    fireEvent.click(btn);
    expect(screen.queryByTestId('mock-downloads-menu')).not.toBeInTheDocument();
  });

  it('closes menu on click-away', () => {
    render(<DownloadsStatus />);

    const btn = screen.getByTestId('sh-downloads-status-button');

    fireEvent.click(btn);
    expect(screen.getByTestId('mock-downloads-menu')).toBeInTheDocument();

    expect(clickAwayHandler).toBeTruthy();

    act(() => {
      clickAwayHandler?.();
    });

    expect(screen.queryByTestId('mock-downloads-menu')).not.toBeInTheDocument();
  });
});
