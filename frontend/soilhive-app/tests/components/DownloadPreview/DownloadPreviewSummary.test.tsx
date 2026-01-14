import { render } from '@testing-library/react';
import DownloadPreviewSummary from 'components/DownloadPreview/DownloadPreviewSummary';

// /* eslint-disable react-hooks/globals */
// jest.mock('components/Map/SoilhiveSimpleMap', () => {
//     return <div data-test-id="mock-soilhive-map">Mock SoilhiveMap</div>;
// });

jest.mock('components/Map/SoilhiveSimpleMap', () => {
  const SoilhiveSimpleMap = () => <div>Mock SoilhiveSimpleMap</div>;
  return SoilhiveSimpleMap;
});

jest.mock('../../../src/utilities/environmentVariables', () => ({
  MAPBOX_ACCESS_TOKEN: 'mock_access_token',
}));

describe('DownloadPreviewSummary', () => {
  it('renders the download preview summary (sidebar)', () => {
    const { container } = render(<DownloadPreviewSummary />);
    expect(container).toMatchSnapshot();
  });
});
