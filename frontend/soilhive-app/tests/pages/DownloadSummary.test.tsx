import React from 'react';
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

jest.mock('../../src/contexts/AvailabilityContext', () => {
  return {
    __esModule: true,
    AvailabilityContext: React.createContext({
      availableDatasets: [{ id: 'test-dataset', soil_properties: ['test-soil-property'] }],
      geometryFilter: [],
      selectedDatasets: [],
      filteredDatasets: [],
      selectedSoilProperties: [],
      filteredSoilProperties: [{ id: 'test-soil-property' }],
      datasetsSummary: {
        globalMinDepth: null,
        globalMaxDepth: null,
      },
    }),
  };
});

describe('DownloadPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders download preview page', () => {
    const { container } = render(<DownloadSummary />);
    expect(container).toMatchSnapshot();
  });

  it('renders download preview page coming from availability', () => {
    mockSearchParamsGet.mockReturnValue('availability');
    const { container, queryByText } = render(<DownloadSummary />);
    expect(container).toMatchSnapshot();
    expect(queryByText('Back to the map')).toBeInTheDocument();
  });

  it('renders download preview page coming from preview', () => {
    mockSearchParamsGet.mockReturnValue('preview');
    const { container, queryByText } = render(<DownloadSummary />);
    expect(container).toMatchSnapshot();
    expect(queryByText('Back to the download preview')).toBeInTheDocument();
  });
});
