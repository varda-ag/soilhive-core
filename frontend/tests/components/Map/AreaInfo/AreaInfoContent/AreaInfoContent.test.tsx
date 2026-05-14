import { render, screen, fireEvent } from '@testing-library/react';
import { area } from '@turf/turf';

import { AreaInfoContent } from 'components/Map/AreaInfo/AreaInfoContent/AreaInfoContent';
import { downloadFile } from '../../../../../src/utilities/download';
import type { MapSelection } from '../../../../../src/contexts/AvailabilityMapContext';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  Trans: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}));

jest.mock('@turf/turf', () => ({
  area: jest.fn(),
}));

jest.mock('../../../../../src/utilities/download', () => ({
  downloadFile: jest.fn(),
}));

jest.mock('components/UI', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
    <button data-testid="download-button" onClick={onClick}>
      {children}
    </button>
  ),
}));

const mockFeature = {
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [] },
  properties: {},
} as unknown as GeoJSON.GeoJSON;

const selectionWithFeature: MapSelection = {
  type: 'FeatureCollection',
  features: [mockFeature],
};

const emptySelection: MapSelection = {
  type: 'FeatureCollection',
  features: [],
};

describe('AreaInfoContent', () => {
  const createObjectURL = jest.fn().mockReturnValue('blob:mock-url');
  const revokeObjectURL = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;
  });

  it('renders location name when provided', () => {
    (area as jest.Mock).mockReturnValue(0);

    render(<AreaInfoContent selection={emptySelection} locationName="Test Location" />);

    expect(screen.getByText('Test Location')).toBeInTheDocument();
  });

  it('does not render location name when omitted', () => {
    render(<AreaInfoContent selection={emptySelection} />);

    expect(screen.queryByText('map_popup.location_label')).not.toBeInTheDocument();
  });

  it('renders area in km² when features are present', () => {
    (area as jest.Mock).mockReturnValue(5_000_000);

    render(<AreaInfoContent selection={selectionWithFeature} />);

    expect(screen.getByText('5.00')).toBeInTheDocument();
    expect(screen.getByText('map_popup.area_unit')).toBeInTheDocument();
  });

  it('does not render area section when features array is empty', () => {
    render(<AreaInfoContent selection={emptySelection} />);

    expect(screen.queryByText('map_popup.area_label')).not.toBeInTheDocument();
  });

  it('passes the first feature to the area function', () => {
    (area as jest.Mock).mockReturnValue(1_000_000);

    render(<AreaInfoContent selection={selectionWithFeature} />);

    expect(area).toHaveBeenCalledWith(mockFeature);
  });

  it('calls downloadFile with locationName-based filename when locationName is provided', () => {
    (area as jest.Mock).mockReturnValue(0);

    render(<AreaInfoContent selection={selectionWithFeature} locationName="My Farm" />);

    fireEvent.click(screen.getByTestId('download-button'));

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(downloadFile).toHaveBeenCalledWith('blob:mock-url', 'My Farm.geojson');
  });

  it('calls downloadFile with default filename when locationName is omitted', () => {
    render(<AreaInfoContent selection={selectionWithFeature} />);

    fireEvent.click(screen.getByTestId('download-button'));

    expect(downloadFile).toHaveBeenCalledWith('blob:mock-url', 'location.geojson');
  });

  it('creates a Blob from the selection JSON', () => {
    render(<AreaInfoContent selection={selectionWithFeature} />);

    fireEvent.click(screen.getByTestId('download-button'));

    const blob: Blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe('application/geo+json');
  });

  it('revokes the object URL after downloading', () => {
    render(<AreaInfoContent selection={selectionWithFeature} />);

    fireEvent.click(screen.getByTestId('download-button'));

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
