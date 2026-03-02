import { act, render } from '@testing-library/react';
import DownloadSummarySidebar from 'components/DownloadSummary/DownloadSummarySidebar/DownloadSummarySidebar';

jest.mock('components/Map/SoilhiveSimpleMap', () => {
  const SoilhiveSimpleMap = () => <div>Mock SoilhiveSimpleMap</div>;
  return SoilhiveSimpleMap;
});

jest.mock('../../../src/utilities/environmentVariables', () => ({
  MAPBOX_ACCESS_TOKEN: 'mock_access_token',
}));

describe('DownloadSummarySidebar', () => {
  it('renders the download summary sidebar', () => {
    const { container, getByText } = render(
      <DownloadSummarySidebar
        locationName="France"
        depthRange="0-50cm"
        dataPoints={7367}
        rasterLayers={4}
        soilProperties={['pH', 'Organic Carbon Content']}
      />,
    );
    expect(container).toMatchSnapshot();
    expect(getByText('Drawn polygon')).not.toBeUndefined();
  });

  it('renders the expanded download preview summary (sidebar)', async () => {
    const mockOnExpandClicked = jest.fn();
    const { container, getByTestId } = render(
      <DownloadSummarySidebar
        locationName="France"
        depthRange="0-50cm"
        dataPoints={7367}
        rasterLayers={4}
        soilProperties={['pH', 'Organic Carbon Content']}
        expanded={true}
        onExpandClicked={mockOnExpandClicked}
      />,
    );
    const reduceButton = getByTestId('reduce-download-preview-summary-button');
    await act(async () => reduceButton.click());
    expect(mockOnExpandClicked).toHaveBeenCalledWith(false);
    expect(container).toMatchSnapshot();
  });

  it('renders the reduced download preview summary (sidebar)', async () => {
    const mockOnExpandClicked = jest.fn();
    const { container, getByTestId } = render(
      <DownloadSummarySidebar
        locationName="France"
        depthRange="0-50cm"
        dataPoints={7367}
        rasterLayers={4}
        soilProperties={['pH', 'Organic Carbon Content']}
        expanded={false}
        onExpandClicked={mockOnExpandClicked}
      />,
    );
    const expandButton = getByTestId('expand-download-preview-summary-button');
    await act(async () => expandButton.click());
    expect(mockOnExpandClicked).toHaveBeenCalledWith(true);
    expect(container).toMatchSnapshot();
  });

  it('renders the download preview summary (sidebar) with selectionType=h3-cell', () => {
    const { container, getByText } = render(
      <DownloadSummarySidebar
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

  it('renders the download preview summary (sidebar) with selectionType=drawn-polygon', () => {
    const { container, getByText } = render(
      <DownloadSummarySidebar
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

  it('renders the download preview summary (sidebar) with selectionType=country', () => {
    const { container, getByText } = render(
      <DownloadSummarySidebar
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
});
