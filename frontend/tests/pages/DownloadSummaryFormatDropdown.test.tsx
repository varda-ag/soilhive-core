import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DomHandler } from 'primereact/utils';
import DownloadSummary from '../../src/pages/DownloadSummary';

// Uses the real PrimeReact Dropdown and provider, which DownloadSummary.test.tsx mocks

jest.mock('react-router', () => ({
  __esModule: true,
  useNavigate: jest.fn().mockReturnValue(jest.fn()),
  useSearchParams: jest.fn().mockReturnValue([{ get: jest.fn() }]),
}));

jest.mock('components/DownloadDataSummary/DownloadDataSummary', () => {
  const DownloadDataSummary = () => <div>Mock DownloadDataSummary</div>;
  return DownloadDataSummary;
});

jest.mock('hooks/useDownloadSummary', () => ({
  useDownloadSummary: jest.fn().mockReturnValue({ datasetsSummary: {} }),
}));

jest.mock('hooks/useDownloads', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue({ startDownload: jest.fn(), setIsOpened: jest.fn() }),
}));

jest.mock('primereact/datatable', () => {
  const DataTable = () => <div>Mock DataTable</div>;
  return { DataTable };
});

jest.mock('hooks/useDevice');

describe('DownloadSummary format dropdown', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('moves the open list along with the dropdown when the window resizes', async () => {
    // PrimeReact takes jsdom for a touch device, where it leaves an open list in place on resize
    jest.spyOn(DomHandler, 'isTouchDevice').mockReturnValue(false);
    const alignOverlay = jest.spyOn(DomHandler, 'alignOverlay');

    render(<DownloadSummary />);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    // PrimeReact starts listening for resizes once the list has finished opening
    await waitFor(() => expect(document.querySelector('.p-dropdown-panel')).toHaveClass('p-connected-overlay-enter-done'));
    alignOverlay.mockClear();

    fireEvent(window, new Event('resize'));

    expect(alignOverlay).toHaveBeenCalled();
  });
});
