import { render } from '@testing-library/react';
import DownloadSummary from '../../src/pages/DownloadSummary';

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

jest.mock('components/DownloadSummary/DownloadSummarySidebar/DownloadSummarySidebar', () => {
  const DownloadSummarySidebar = () => <div>Mock DownloadSummarySidebar</div>;
  return DownloadSummarySidebar;
});

jest.mock('hooks/useDownloadSummary', () => {
  return {
    useDownloadSummary: jest.fn().mockReturnValue({ datasetsSummary: {} }),
  };
});

describe('DownloadSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('renders download summary page coming from preview', () => {
    mockSearchParamsGet.mockReturnValue('preview');
    const { container, queryByText } = render(<DownloadSummary />);
    expect(container).toMatchSnapshot();
    expect(queryByText('Back to the download preview')).toBeInTheDocument();
  });
});
