import { act, render } from '@testing-library/react';
import DownloadDataSummary from 'components/DownloadDataSummary/DownloadDataSummary';
import { __setIsDesktopLayout } from 'hooks/useDevice';

jest.mock('components/Map/SoilhiveSimpleMap', () => {
  const SoilhiveSimpleMap = () => <div>Mock SoilhiveSimpleMap</div>;
  return SoilhiveSimpleMap;
});

jest.mock('../../../src/utilities/environmentVariables', () => ({
  MAPBOX_ACCESS_TOKEN: 'mock_access_token',
}));

jest.mock('react-tooltip', () => ({
  Tooltip: ({ id }: { id: string }) => <div data-testid={`tooltip-${id}`} />,
}));

jest.mock('hooks/useDevice');

describe('DownloadDataSummary', () => {
  beforeEach(() => {
    __setIsDesktopLayout(true);
  });

  it('renders the download data summary (sidebar)', () => {
    const { container, getByText, queryByTestId } = render(
      <DownloadDataSummary
        locationName="France"
        depthRange="0-50cm"
        dataPoints={7367}
        rasterLayers={4}
        soilProperties={['pH', 'Organic Carbon Content']}
      />,
    );
    expect(container).toMatchSnapshot();
    expect(container.querySelector('.DownloadDataSummary')).not.toBeNull();
    expect(getByText('Drawn polygon')).not.toBeUndefined();
    expect(queryByTestId('tooltip-soil-samples-tooltip')).not.toBeNull();
  });

  it('renders the download data summary (sidebar) in mobile and tablet', () => {
    __setIsDesktopLayout(false);
    const { container, queryByTestId } = render(
      <DownloadDataSummary
        locationName="France"
        depthRange="0-50cm"
        dataPoints={7367}
        rasterLayers={4}
        soilProperties={['pH', 'Organic Carbon Content']}
      />,
    );
    expect(container).toMatchSnapshot();
    expect(queryByTestId('expand-download-data-summary-button')).not.toBeInTheDocument();
    expect(queryByTestId('reduce-download-data-summary-button')).not.toBeInTheDocument();
  });

  it('renders the expanded download data summary (sidebar)', async () => {
    const mockOnExpandClicked = jest.fn();
    const { container, getByTestId } = render(
      <DownloadDataSummary
        locationName="France"
        depthRange="0-50cm"
        dataPoints={7367}
        rasterLayers={4}
        soilProperties={['pH', 'Organic Carbon Content']}
        expanded={true}
        onExpandClicked={mockOnExpandClicked}
      />,
    );
    const reduceButton = getByTestId('reduce-download-data-summary-button');
    await act(async () => reduceButton.click());
    expect(mockOnExpandClicked).toHaveBeenCalledWith(false);
    expect(container).toMatchSnapshot();
  });

  it('renders the reduced download data summary (sidebar)', async () => {
    const mockOnExpandClicked = jest.fn();
    const { container, getByTestId } = render(
      <DownloadDataSummary
        locationName="France"
        depthRange="0-50cm"
        dataPoints={7367}
        rasterLayers={4}
        soilProperties={['pH', 'Organic Carbon Content']}
        expanded={false}
        onExpandClicked={mockOnExpandClicked}
      />,
    );
    const expandButton = getByTestId('expand-download-data-summary-button');
    await act(async () => expandButton.click());
    expect(mockOnExpandClicked).toHaveBeenCalledWith(true);
    expect(container).toMatchSnapshot();
  });

  it('renders the download data summary (sidebar) with selectionType=h3-cell', () => {
    const { container, getByText } = render(
      <DownloadDataSummary
        locationName="France"
        depthRange="0-50cm"
        dataPoints={7367}
        rasterLayers={4}
        soilProperties={['pH', 'Organic Carbon Content']}
        selectionType="h3-cell"
      />,
    );
    expect(container).toMatchSnapshot();
    expect(getByText('H3cell selected')).not.toBeUndefined();
  });

  it('renders the download data summary (sidebar) with selectionType=drawn-polygon', () => {
    const { container, getByText } = render(
      <DownloadDataSummary
        locationName="France"
        depthRange="0-50cm"
        dataPoints={7367}
        rasterLayers={4}
        soilProperties={['pH', 'Organic Carbon Content']}
        selectionType="drawn-polygon"
      />,
    );
    expect(container).toMatchSnapshot();
    expect(getByText('Drawn polygon')).not.toBeUndefined();
  });

  it('renders the download data summary (sidebar) with selectionType=country', () => {
    const { container, getByText } = render(
      <DownloadDataSummary
        locationName="France"
        depthRange="0-50cm"
        dataPoints={7367}
        rasterLayers={4}
        soilProperties={['pH', 'Organic Carbon Content']}
        selectionType="country"
      />,
    );
    expect(container).toMatchSnapshot();
    expect(getByText('Country selected')).not.toBeUndefined();
  });

  it('renders the download data summary (sidebar) with responsiveness turned off', () => {
    const { container } = render(
      <DownloadDataSummary
        responsive={false}
        locationName="France"
        depthRange="0-50cm"
        dataPoints={7367}
        rasterLayers={4}
        soilProperties={['pH', 'Organic Carbon Content']}
        selectionType="country"
      />,
    );
    expect(container).toMatchSnapshot();
    expect(container.querySelector('.DownloadDataSummaryNonResponsive')).not.toBeNull();
  });
});
