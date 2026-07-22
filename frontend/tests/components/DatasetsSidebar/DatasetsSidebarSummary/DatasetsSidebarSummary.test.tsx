import { render, screen } from '@testing-library/react';
import { DatasetsSidebarSummary } from 'components/DatasetsSidebar/DatasetsSidebarSummary/DatasetsSidebarSummary';

jest.mock('components/DatasetsSidebar/DatasetsSidebarSummary/DatasetsSidebarSummaryItem/DatasetsSidebarSummaryItem', () => ({
  DatasetsSidebarSummaryItem: ({ name, value, color, preview, isLoading }: any) => (
    <div data-testid={`summary-item-${name}`} data-preview={String(preview)} data-loading={String(isLoading)}>
      <span data-testid={`value-${name}`}>{value}</span>
      <span data-testid={`color-${name}`}>{color}</span>
    </div>
  ),
}));

const datasetsSummary = {
  count: 12,
  dataPoints: 345000,
  layers: 15,
  depth: '0–60 cm',
  date: '2020 – 2024',
  globalDateStart: null,
  globalDateEnd: null,
  globalMinDepth: null,
  globalMaxDepth: null,
};

describe('DatasetsSidebarSummary', () => {
  it('renders all summary items with correct values', () => {
    const { container } = render(<DatasetsSidebarSummary datasetsSummary={datasetsSummary} />);

    expect(container.firstChild).not.toHaveClass('Preview');
    expect(container).toMatchSnapshot();
  });

  it('applies Preview class when preview prop is true', () => {
    const { container } = render(<DatasetsSidebarSummary datasetsSummary={datasetsSummary} preview />);

    expect(container.firstChild).toHaveClass('Preview');
  });

  it('passes preview prop down to each summary item', () => {
    render(<DatasetsSidebarSummary datasetsSummary={datasetsSummary} preview />);

    screen.getAllByTestId(/^summary-item-/).forEach(item => {
      expect(item).toHaveAttribute('data-preview', 'true');
    });
  });

  it('passes isLoading to data points, raster layers and depth range items but not to count item', () => {
    render(<DatasetsSidebarSummary datasetsSummary={datasetsSummary} isLoading />);

    expect(screen.getByTestId(/^summary-item-Datasets/)).toHaveAttribute('data-loading', 'undefined');
    expect(screen.getByTestId(/^summary-item-Soil Samples/)).toHaveAttribute('data-loading', 'true');
    expect(screen.getByTestId(/^summary-item-Raster layers/)).toHaveAttribute('data-loading', 'true');
    expect(screen.getByTestId(/^summary-item-Depth range/)).toHaveAttribute('data-loading', 'true');
  });

  it('passes isCountLoading only to the count item', () => {
    render(<DatasetsSidebarSummary datasetsSummary={datasetsSummary} isCountLoading />);

    expect(screen.getByTestId(/^summary-item-Datasets/)).toHaveAttribute('data-loading', 'true');
    expect(screen.getByTestId(/^summary-item-Soil Samples/)).toHaveAttribute('data-loading', 'undefined');
    expect(screen.getByTestId(/^summary-item-Raster layers/)).toHaveAttribute('data-loading', 'undefined');
    expect(screen.getByTestId(/^summary-item-Depth range/)).toHaveAttribute('data-loading', 'undefined');
  });

  it('shows skeleton in date section when isLoading is true', () => {
    const { container } = render(<DatasetsSidebarSummary datasetsSummary={datasetsSummary} isLoading />);

    expect(container.querySelector('.react-loading-skeleton')).toBeTruthy();
    expect(screen.queryByText('2020 – 2024')).not.toBeInTheDocument();
  });

  it('shows date when isLoading is false', () => {
    const { container } = render(<DatasetsSidebarSummary datasetsSummary={datasetsSummary} />);

    expect(container.querySelector('.react-loading-skeleton')).not.toBeTruthy();
    expect(screen.getByText('2020 – 2024')).toBeInTheDocument();
  });
});
