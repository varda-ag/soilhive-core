import { render, screen, fireEvent, act } from '@testing-library/react';
import DownloadSummary from '../../src/pages/DownloadSummary';
import { useDownloadSummary } from 'hooks/useDownloadSummary';
import useDownloads from 'hooks/useDownloads';
import { __setIsMobileLayout, __resetIsMobileLayout, __setIsMobileDevice, __resetIsMobileDevice } from 'hooks/useDevice';
import { GISDataType } from '../../src/types/backend';

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
  });
});
