import { act, render } from '@testing-library/react';
import DownloadPreviewSummary from 'components/DownloadPreview/DownloadPreviewSummary';
import { __setIsMobileLayout } from 'hooks/useDevice';

jest.mock('components/Map/SoilhiveSimpleMap', () => {
  const SoilhiveSimpleMap = () => <div>Mock SoilhiveSimpleMap</div>;
  return SoilhiveSimpleMap;
});

jest.mock('../../../src/utilities/environmentVariables', () => ({
  MAPBOX_ACCESS_TOKEN: 'mock_access_token',
}));

jest.mock('hooks/useDevice');

describe('DownloadPreviewSummary', () => {
  beforeEach(() => {
    __setIsMobileLayout(false);
  });

  it('renders the download preview summary (sidebar)', () => {
    const { container, getByText } = render(
      <DownloadPreviewSummary
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

  it('renders the download preview summary (sidebar) in mobile', () => {
    __setIsMobileLayout(true);
    const { container, queryByTestId } = render(
      <DownloadPreviewSummary
        locationName="France"
        depthRange="0-50cm"
        dataPoints={7367}
        rasterLayers={4}
        soilProperties={['pH', 'Organic Carbon Content']}
      />,
    );
    expect(container).toMatchSnapshot();
    expect(queryByTestId('expand-download-preview-summary-button')).not.toBeInTheDocument();
    expect(queryByTestId('reduce-download-preview-summary-button')).not.toBeInTheDocument();
  });

  it('renders the expanded download preview summary (sidebar) when clicking on the expand icon', async () => {
    const { container, getByTestId } = render(
      <DownloadPreviewSummary
        locationName="France"
        depthRange="0-50cm"
        dataPoints={7367}
        rasterLayers={4}
        soilProperties={['pH', 'Organic Carbon Content']}
      />,
    );
    const expandButton = getByTestId('expand-download-preview-summary-button');
    await act(async () => expandButton.click());
    expect(container).toMatchSnapshot();
  });

  it('renders the reduced download preview summary (sidebar) when clicking on the reduce icon', async () => {
    const { container, getByTestId } = render(
      <DownloadPreviewSummary
        locationName="France"
        depthRange="0-50cm"
        dataPoints={7367}
        rasterLayers={4}
        soilProperties={['pH', 'Organic Carbon Content']}
      />,
    );
    // first we expand it since it's reduced by default
    const expandButton = getByTestId('expand-download-preview-summary-button');
    await act(async () => expandButton.click());
    // then we reduce it
    const reduceButton = getByTestId('reduce-download-preview-summary-button');
    await act(async () => reduceButton.click());
    expect(container).toMatchSnapshot();
  });

  it('renders the download preview summary (sidebar) with selectionType=h3-cell', () => {
    const { container, getByText } = render(
      <DownloadPreviewSummary
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
      <DownloadPreviewSummary
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
      <DownloadPreviewSummary
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
