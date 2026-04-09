import { render, screen } from '@testing-library/react';
import { DatasetsSidebarSummary } from 'components/DatasetsSidebar/DatasetsSidebarSummary/DatasetsSidebarSummary';

jest.mock('components/DatasetsSidebar/DatasetsSidebarSummary/DatasetsSidebarSummaryItem/DatasetsSidebarSummaryItem', () => ({
  DatasetsSidebarSummaryItem: ({ name, value, color, preview }: any) => (
    <div data-testid={`summary-item-${name}`} data-preview={String(preview)}>
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
});
