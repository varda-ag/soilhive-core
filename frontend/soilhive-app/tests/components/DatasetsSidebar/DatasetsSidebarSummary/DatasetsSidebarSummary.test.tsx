import { render } from '@testing-library/react';
import { DatasetsSidebarSummary } from 'components/DatasetsSidebar/DatasetsSidebarSummary/DatasetsSidebarSummary';
import useAvailability from 'hooks/useAvailability';

jest.mock('hooks/useAvailability', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('components/DatasetsSidebar/DatasetsSidebarSummary/DatasetsSidebarSummaryItem/DatasetsSidebarSummaryItem', () => ({
  DatasetsSidebarSummaryItem: ({ name, value, color }: any) => (
    <div data-testid={`summary-item-${name}`}>
      <span data-testid={`value-${name}`}>{value}</span>
      <span data-testid={`color-${name}`}>{color}</span>
    </div>
  ),
}));

describe('DatasetsSidebarSummary', () => {
  beforeEach(() => {
    (useAvailability as jest.Mock).mockReturnValue({
      datasetsSummary: {
        count: 12,
        dataPoints: 345000,
        layers: 15,
        depth: '0–60 cm',
        date: '2020 – 2024',
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders all summary items with correct values', () => {
    const { container } = render(<DatasetsSidebarSummary />);

    expect(container).toMatchSnapshot();
  });
});
