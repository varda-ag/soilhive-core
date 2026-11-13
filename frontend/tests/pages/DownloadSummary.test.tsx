import { render, screen, fireEvent, act } from '@testing-library/react';
import DownloadSummary from '../../src/pages/DownloadSummary';
import { useDownloadSummary } from 'hooks/useDownloadSummary';
import useDownloads from 'hooks/useDownloads';
import { useIsSignInRequiredToDownload } from 'hooks/useIsSignInRequiredToDownload';
import { __setIsMobileLayout, __resetIsMobileLayout, __setIsMobileDevice, __resetIsMobileDevice } from 'hooks/useDevice';
import { GISDataType } from '../../src/types/backend';
import { useLocation, useNavigate } from 'react-router';
import { setRestoredPageState } from '../../src/auth/signinPageState';
import { trackEvent } from 'utilities/analytics';

jest.mock('utilities/analytics', () => ({ trackEvent: jest.fn() }));

jest.mock('react-router', () => {
  const mockSearchParamsGet = jest.fn();
  return {
    __esModule: true,
    useNavigate: jest.fn().mockReturnValue(jest.fn()),
    useSearchParams: jest.fn().mockReturnValue([
      {
        get: mockSearchParamsGet,
      },
    ]),
    useLocation: jest.fn(),
    mockSearchParamsGet,
  };
});
const { mockSearchParamsGet } = jest.requireMock('react-router');

jest.mock('components/DownloadDataSummary/DownloadDataSummary', () => {
  const DownloadDataSummary = () => <div>Mock DownloadDataSummary</div>;
  return DownloadDataSummary;
});

jest.mock('hooks/useDownloadSummary', () => {
  return {
    useDownloadSummary: jest.fn().mockReturnValue({ datasetsSummary: {} }),
  };
});

jest.mock('hooks/useDownloads', () => {
  return {
    __esModule: true,
    default: jest.fn().mockReturnValue({
      startDownload: jest.fn(),
      setIsOpened: jest.fn(),
    }),
  };
});

jest.mock('hooks/useIsSignInRequiredToDownload', () => ({
  useIsSignInRequiredToDownload: jest.fn(),
}));

jest.mock('components/DownloadSignInDialog/DownloadSignInDialog', () => ({
  DownloadSignInDialog: ({ visible, pageState }: any) =>
    visible ? <div data-testid="download-sign-in-dialog">{JSON.stringify(pageState)}</div> : null,
}));

jest.mock('primereact/checkbox', () => {
  const Checkbox = ({ checked, onChange, inputId }: any) => (
    <input id={inputId} type="checkbox" checked={checked ?? false} onChange={e => onChange?.({ checked: e.target.checked })} />
  );
  return { Checkbox };
});

jest.mock('primereact/dropdown', () => {
  const Dropdown = ({ options, value, onChange }: any) => (
    <select data-testid="format-dropdown" value={value ?? ''} onChange={e => onChange?.({ value: e.target.value })}>
      {options?.map((o: any) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
  return { Dropdown };
});

jest.mock('primereact/datatable', () => {
  const mockDataTableProps = jest.fn();
  const DataTable = (props: { children: React.ReactNode }) => {
    mockDataTableProps(props);
    return <div>Mock DataTable {props.children}</div>;
  };
  return { DataTable, mockDataTableProps };
});
const { mockDataTableProps } = jest.requireMock('primereact/datatable');

jest.mock('primereact/column', () => {
  const Column = () => <div>Mock Column</div>;
  return { Column };
});

jest.mock('primereact/api', () => {
  const PrimeReactProvider = ({ children }: { children: React.ReactNode }) => <div>Mock PrimeReactProvider {children}</div>;
  return { PrimeReactProvider };
});

jest.mock('hooks/useDevice');

const vectorDataset = { id: 'v1', name: 'Vector Dataset', licenses: [], dataType: GISDataType.POINT, layerCount: 100 };
const rasterDataset = { id: 'r1', name: 'Raster Dataset', licenses: [], dataType: GISDataType.RASTER, layerCount: 5 };

describe('DownloadSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useIsSignInRequiredToDownload as jest.Mock).mockReturnValue(false);
    // Reached from another page of the app, unless a test says otherwise
    (useLocation as jest.Mock).mockReturnValue({ key: 'in-app-entry' });
  });

  afterEach(() => {
    __resetIsMobileLayout();
    __resetIsMobileDevice();
  });

  it('renders download summary page', () => {
    const { container } = render(<DownloadSummary />);
    expect(container).toMatchSnapshot();
  });

  it('renders download summary page coming from availability', () => {
    mockSearchParamsGet.mockReturnValue('availability');
    const { container, queryByText } = render(<DownloadSummary />);
    expect(container).toMatchSnapshot();
    expect(queryByText('Back to the map')).toBeInTheDocument();
  });

  it('renders download summary page coming from data explorer', () => {
    mockSearchParamsGet.mockReturnValue('explore');
    const { container, queryByText } = render(<DownloadSummary />);
    expect(container).toMatchSnapshot();
    expect(queryByText('Back to the data explorer')).toBeInTheDocument();
  });

  describe('format options by dataset type', () => {
    it('shows vector options when all datasets are vector', () => {
      (useDownloadSummary as jest.Mock).mockReturnValue({ datasets: [vectorDataset], datasetsSummary: {} });
      render(<DownloadSummary />);
      const dropdown = screen.getByTestId('format-dropdown');
      expect(dropdown).toHaveValue('csv');
      expect(screen.getByRole('option', { name: 'CSV' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'GeoJSON' })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Geotiff' })).not.toBeInTheDocument();
    });

    it('shows raster options when all datasets are raster', () => {
      (useDownloadSummary as jest.Mock).mockReturnValue({ datasets: [rasterDataset], datasetsSummary: {} });
      render(<DownloadSummary />);
      const dropdown = screen.getByTestId('format-dropdown');
      expect(dropdown).toHaveValue('tiff');
      expect(screen.getByRole('option', { name: 'Geotiff' })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'CSV' })).not.toBeInTheDocument();
    });

    it('shows mixed options when datasets include both types', () => {
      (useDownloadSummary as jest.Mock).mockReturnValue({
        datasets: [vectorDataset, rasterDataset],
        datasetsSummary: {},
      });
      render(<DownloadSummary />);
      const dropdown = screen.getByTestId('format-dropdown');
      expect(dropdown).toHaveValue('gpkg');
      expect(screen.getByRole('option', { name: 'CSV + Geotiff' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Geopackage' })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'CSV' })).not.toBeInTheDocument();
    });
  });

  describe('format selection when changing datasets', () => {
    const selectDatasets = (value: unknown[]) => act(() => mockDataTableProps.mock.lastCall[0].onSelectionChange({ value }));

    it('keeps options and format when all datasets are deselected', () => {
      (useDownloadSummary as jest.Mock).mockReturnValue({ datasets: [rasterDataset], datasetsSummary: {} });
      render(<DownloadSummary />);
      const dropdown = screen.getByTestId('format-dropdown');
      fireEvent.change(dropdown, { target: { value: 'gpkg' } });

      selectDatasets([]);
      expect(dropdown).toHaveValue('gpkg');
      expect(screen.getByRole('option', { name: 'Geotiff' })).toBeInTheDocument();

      selectDatasets([rasterDataset]);
      expect(dropdown).toHaveValue('gpkg');
    });

    it('resets to the default format when the dataset types change', () => {
      (useDownloadSummary as jest.Mock).mockReturnValue({
        datasets: [vectorDataset, rasterDataset],
        datasetsSummary: {},
      });
      render(<DownloadSummary />);
      const dropdown = screen.getByTestId('format-dropdown');
      expect(dropdown).toHaveValue('gpkg');

      selectDatasets([rasterDataset]);
      expect(dropdown).toHaveValue('tiff');
    });
  });

  describe('download API call', () => {
    it('sends single-format array for raster datasets', () => {
      const startDownload = jest.fn();
      (useDownloads as jest.Mock).mockReturnValue({ startDownload, setIsOpened: jest.fn() });
      (useDownloadSummary as jest.Mock).mockReturnValue({ datasets: [rasterDataset], datasetsSummary: {} });
      mockSearchParamsGet.mockImplementation((key: string) => (key === 'filterId' ? 'test-filter' : null));

      render(<DownloadSummary />);

      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: /download data/i }));

      expect(startDownload).toHaveBeenCalledWith(expect.objectContaining({ formats: ['tiff'] }));
    });

    it('sends multi-format array for mixed CSV + Geotiff selection', () => {
      const startDownload = jest.fn();
      (useDownloads as jest.Mock).mockReturnValue({ startDownload, setIsOpened: jest.fn() });
      (useDownloadSummary as jest.Mock).mockReturnValue({
        datasets: [vectorDataset, rasterDataset],
        datasetsSummary: {},
      });
      mockSearchParamsGet.mockImplementation((key: string) => (key === 'filterId' ? 'test-filter' : null));

      render(<DownloadSummary />);

      fireEvent.change(screen.getByTestId('format-dropdown'), { target: { value: 'csv+tiff' } });
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: /download data/i }));

      expect(startDownload).toHaveBeenCalledWith(expect.objectContaining({ formats: ['csv', 'tiff'] }));
    });
  });

  describe('usage analytics', () => {
    const searchParams: Record<string, string> = { filterId: 'test-filter', source: 'explore', selectionType: 'country' };

    const clickDownload = async (startDownload: jest.Mock) => {
      (useDownloads as jest.Mock).mockReturnValue({ startDownload, setIsOpened: jest.fn() });
      (useDownloadSummary as jest.Mock).mockReturnValue({ datasets: [vectorDataset], datasetsSummary: {}, appliedFilterCount: 2 });
      mockSearchParamsGet.mockImplementation((key: string) => searchParams[key] ?? null);
      render(<DownloadSummary />);
      fireEvent.click(screen.getByRole('checkbox'));
      await act(async () => fireEvent.click(screen.getByRole('button', { name: /download data/i })));
    };

    it('sends download_data_request once the export started, with its format and the filters it was made with', async () => {
      await clickDownload(jest.fn().mockResolvedValue('job-1'));

      expect(trackEvent).toHaveBeenCalledTimes(1);
      expect(trackEvent).toHaveBeenCalledWith('download_data_request', {
        format: 'csv',
        data_scenario: 'vector',
        download_source: 'explore',
        dataset_count: 1,
        selection_type: 'country',
        filters_applied: 'yes',
        filter_count: 2,
      });
    });

    it('sends nothing when the export is refused', async () => {
      await clickDownload(jest.fn().mockResolvedValue(null));

      expect(trackEvent).not.toHaveBeenCalled();
    });

    it('sends nothing when a signed-out visitor is asked to log in', async () => {
      (useIsSignInRequiredToDownload as jest.Mock).mockReturnValue(true);
      const startDownload = jest.fn();
      await clickDownload(startDownload);

      expect(startDownload).not.toHaveBeenCalled();
      expect(trackEvent).not.toHaveBeenCalled();
    });

    it('sends download_format_select with the format the visitor picked, and nothing when it is the same one', () => {
      (useDownloadSummary as jest.Mock).mockReturnValue({ datasets: [vectorDataset], datasetsSummary: {} });
      render(<DownloadSummary />);
      const dropdown = screen.getByTestId('format-dropdown');

      fireEvent.change(dropdown, { target: { value: 'gpkg' } });
      fireEvent.change(dropdown, { target: { value: 'gpkg' } });

      expect(trackEvent).toHaveBeenCalledTimes(1);
      expect(trackEvent).toHaveBeenCalledWith('download_format_select', { format: 'gpkg' });
    });

    it('marks the Download button for the GTM click trigger', () => {
      (useDownloadSummary as jest.Mock).mockReturnValue({ datasets: [vectorDataset], datasetsSummary: {} });
      render(<DownloadSummary />);
      const button = screen.getByRole('button', { name: /download data/i });
      expect(button).toHaveAttribute('data-analytics', 'click_on_download_button');
      expect(button).toHaveAttribute('data-analytics-value', 'summary');
    });
  });

  describe('download button by device', () => {
    // Datasets loaded and terms agreed, so only the device can disable the button
    const renderReadyToDownload = () => {
      (useDownloadSummary as jest.Mock).mockReturnValue({ datasets: [vectorDataset], datasetsSummary: {} });
      render(<DownloadSummary />);
      fireEvent.click(screen.getByRole('checkbox'));
      return screen.getByRole('button', { name: /download data/i });
    };

    it('disables download button on a phone', () => {
      __setIsMobileDevice(true);
      expect(renderReadyToDownload()).toBeDisabled();
    });

    it('enables download button in a narrow window on a laptop', () => {
      __setIsMobileLayout(true);
      expect(renderReadyToDownload()).toBeEnabled();
    });

    it('asks a signed-out visitor to log in instead of starting the download, while a signed-in user is required to download', () => {
      const startDownload = jest.fn();
      (useDownloads as jest.Mock).mockReturnValue({ startDownload, setIsOpened: jest.fn() });
      mockSearchParamsGet.mockImplementation((key: string) => (key === 'filterId' ? 'test-filter' : null));
      (useIsSignInRequiredToDownload as jest.Mock).mockReturnValue(true);

      const downloadButton = renderReadyToDownload();
      expect(downloadButton).toBeEnabled();
      fireEvent.click(downloadButton);

      expect(startDownload).not.toHaveBeenCalled();
      // The sign-in comes back to this page, with the Datasets and the format chosen here
      expect(JSON.parse(screen.getByTestId('download-sign-in-dialog').textContent!)).toEqual({
        downloadSummary: { datasetIds: ['v1'], format: 'csv' },
      });
    });
  });

  describe('after a sign-in started here', () => {
    afterEach(() => setRestoredPageState(undefined));

    it('ticks again the Datasets and picks again the format chosen before it', () => {
      setRestoredPageState({ downloadSummary: { datasetIds: ['r1'], format: 'gpkg' } });
      (useDownloadSummary as jest.Mock).mockReturnValue({ datasets: [vectorDataset, rasterDataset], datasetsSummary: {} });

      render(<DownloadSummary />);

      expect(mockDataTableProps.mock.lastCall[0].selection).toEqual([rasterDataset]);
      expect(screen.getByTestId('format-dropdown')).toHaveValue('gpkg');
      expect(screen.getByRole('option', { name: 'Geotiff' })).toBeInTheDocument();
      // The terms are for the signed-in user to agree to
      expect(screen.getByRole('checkbox')).not.toBeChecked();
    });

    it('keeps the default format when the chosen one does not fit the Datasets', () => {
      setRestoredPageState({ downloadSummary: { datasetIds: ['v1'], format: 'tiff' } });
      (useDownloadSummary as jest.Mock).mockReturnValue({ datasets: [vectorDataset, rasterDataset], datasetsSummary: {} });

      render(<DownloadSummary />);

      expect(mockDataTableProps.mock.lastCall[0].selection).toEqual([vectorDataset]);
      expect(screen.getByTestId('format-dropdown')).toHaveValue('csv');
    });

    it('ticks every Dataset when none of the chosen ones is still listed', () => {
      setRestoredPageState({ downloadSummary: { datasetIds: ['gone'], format: 'gpkg' } });
      (useDownloadSummary as jest.Mock).mockReturnValue({ datasets: [vectorDataset, rasterDataset], datasetsSummary: {} });

      render(<DownloadSummary />);

      expect(mockDataTableProps.mock.lastCall[0].selection).toEqual([vectorDataset, rasterDataset]);
    });
  });

  describe('back button', () => {
    const params: Record<string, string> = { selectionType: 'country', locationName: 'Nakuru, Kenya', filterId: 'f1', datasets: 'a,b' };
    const clickBack = (source: string) => {
      const navigate = jest.fn();
      (useNavigate as jest.Mock).mockReturnValue(navigate);
      mockSearchParamsGet.mockImplementation((key: string) => (key === 'source' ? source : (params[key] ?? null)));
      render(<DownloadSummary />);
      fireEvent.click(screen.getByTestId('download-preview-back-button'));
      return navigate;
    };

    it('goes back to the previous page of the app', () => {
      expect(clickBack('availability')).toHaveBeenCalledWith(-1);
    });

    describe('when no page of the app is behind this one, as after a sign-in', () => {
      beforeEach(() => (useLocation as jest.Mock).mockReturnValue({ key: 'default' }));

      it('goes to the map', () => {
        expect(clickBack('availability')).toHaveBeenCalledWith('/');
      });

      it('goes to the Data Explorer of the same selection', () => {
        expect(clickBack('explore')).toHaveBeenCalledWith({
          pathname: '/explore',
          search: `?${new URLSearchParams(params).toString()}`,
        });
      });
    });
  });
});
