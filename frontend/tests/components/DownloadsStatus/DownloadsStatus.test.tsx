import { render, screen, fireEvent, act } from '@testing-library/react';
import { useState } from 'react';
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

function renderWithState(downloads = [{ id: '1', progress: 10 }]) {
  function Wrapper() {
    const [isOpened, setIsOpened] = useState(false);
    (useDownloads as jest.Mock).mockReturnValue({ downloads, isOpened, setIsOpened });
    return <DownloadsStatus />;
  }
  return render(<Wrapper />);
}

describe('DownloadsStatus', () => {
  let clickAwayHandler: (() => void) | null = null;

  beforeEach(() => {
    clickAwayHandler = null;

    (useClickAway as jest.Mock).mockImplementation((_ref, cb) => {
      clickAwayHandler = cb;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when there are no downloads', () => {
    const { container } = renderWithState([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders component with closed menu', () => {
    const { container } = renderWithState();

    expect(screen.getByTestId('sh-downloads-status')).toBeInTheDocument();
    expect(screen.getByTestId('sh-downloads-status-button')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-downloads-menu')).not.toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('toggles menu open/close on button click', () => {
    const { container } = renderWithState();

    const btn = screen.getByTestId('sh-downloads-status-button');

    expect(screen.queryByTestId('mock-downloads-menu')).not.toBeInTheDocument();

    fireEvent.click(btn);
    expect(screen.getByTestId('mock-downloads-menu')).toBeInTheDocument();
    expect(container).toMatchSnapshot();

    fireEvent.click(btn);
    expect(screen.queryByTestId('mock-downloads-menu')).not.toBeInTheDocument();
  });

  it('closes menu on click-away', () => {
    renderWithState();

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
