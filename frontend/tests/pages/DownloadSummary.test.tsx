import { render, screen } from '@testing-library/react';
import DownloadSummary from '../../src/pages/DownloadSummary';
import { __setIsMobileLayout, __resetIsMobileLayout } from 'hooks/useDevice';

jest.mock('react-router', () => {
  const mockSearchParamsGet = jest.fn();
  return {
    __esModule: true,
    useNavigate: jest.fn(),
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
    }),
  };
});

jest.mock('primereact/checkbox', () => {
  const Checkbox = () => <div>Mock Checkbox</div>;
  return { Checkbox };
});

jest.mock('primereact/dropdown', () => {
  const Dropdown = () => <div>Mock Dropdown</div>;
  return { Dropdown };
});

jest.mock('primereact/datatable', () => {
  const DataTable = ({ children }: { children: React.ReactNode }) => <div>Mock DataTable {children}</div>;
  return { DataTable };
});

jest.mock('primereact/column', () => {
  const Column = () => <div>Mock Column</div>;
  return { Column };
});

jest.mock('primereact/api', () => {
  const PrimeReactProvider = ({ children }: { children: React.ReactNode }) => <div>Mock PrimeReactProvider {children}</div>;
  return { PrimeReactProvider };
});

jest.mock('hooks/useDevice');

describe('DownloadSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    __resetIsMobileLayout();
  });

  it('disables download button on mobile layout', () => {
    __setIsMobileLayout(true);
    render(<DownloadSummary />);
    const downloadButton = screen.getByRole('button', { name: /download data/i });
    expect(downloadButton).toBeDisabled();
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
});
