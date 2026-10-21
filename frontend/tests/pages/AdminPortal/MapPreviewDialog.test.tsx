import { render, screen } from '@testing-library/react';
import { MapPreviewDialog } from '../../../src/pages/AdminPortal/DatasetsSoilDataStep/MapPreviewDialog/MapPreviewDialog';
import type { Georeference } from 'types/backend';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('components/Dialog/Dialog', () => ({
  Dialog: ({ visible, children }: any) => (visible ? <div data-testid="sh-dialog">{children}</div> : null),
}));

jest.mock('components/UI', () => ({
  FormMessage: ({ message }: any) => <div data-testid="sh-form-message">{message}</div>,
}));

const mockMapProps = jest.fn();
const mockSourceProps = jest.fn();

jest.mock('components/Map/SoilhiveSimpleMap', () => ({
  __esModule: true,
  default: ({ children, ...props }: any) => {
    mockMapProps(props);
    return <div data-testid="sh-simple-map">{children}</div>;
  },
}));

jest.mock('react-map-gl/maplibre', () => ({
  Source: (props: any) => {
    mockSourceProps(props);
    return null;
  },
  Layer: () => null,
}));

const MAP_MAX_LATITUDE = 85.051129;

const drawnOutline = () => mockMapProps.mock.lastCall[0].geometryFeature.features[0].geometry.coordinates[0];
const drawnCorners = () => mockSourceProps.mock.lastCall[0].data.features.map((f: any) => f.geometry.coordinates);

const inItaly: Georeference = [
  [9, 46],
  [10, 46],
  [10, 45],
  [9, 45],
];

// What a raster in degrees reads as when EPSG:2309 (metres) is supplied for it
const nearTheSouthPole: Georeference = [
  [25.7647958795461, -85.5252219345135],
  [25.764786453838, -85.52540053034],
  [25.7624973605532, -85.5253997913352],
  [25.7625068779899, -85.5252211955383],
];

describe('MapPreviewDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the map for a file the map can draw', () => {
    render(<MapPreviewDialog visible fileName="a.tif" georeference={inItaly} onClose={jest.fn()} />);

    expect(screen.getByTestId('sh-simple-map')).toBeInTheDocument();
    expect(screen.queryByTestId('sh-form-message')).not.toBeInTheDocument();
  });

  it('explains, rather than showing an empty map, when the file lies beyond the latitudes the map can show', () => {
    render(<MapPreviewDialog visible fileName="a.tif" georeference={nearTheSouthPole} onClose={jest.fn()} />);

    expect(screen.getByTestId('sh-form-message')).toHaveTextContent('datasets.soil_data.map_preview.beyond_map');
    expect(screen.queryByTestId('sh-simple-map')).not.toBeInTheDocument();
  });

  it('draws the outline closed, through the four corners', () => {
    render(<MapPreviewDialog visible fileName="a.tif" georeference={inItaly} onClose={jest.fn()} />);

    expect(drawnOutline()).toEqual([...inItaly, inItaly[0]]);
    expect(drawnCorners()).toEqual(inItaly);
  });

  it('shows a global raster, its outline held to the latitudes the map can show', () => {
    const global: Georeference = [
      [-180, 90],
      [180, 90],
      [180, -90],
      [-180, -90],
    ];

    render(<MapPreviewDialog visible fileName="world.tif" georeference={global} onClose={jest.fn()} />);

    expect(screen.queryByTestId('sh-form-message')).not.toBeInTheDocument();
    expect(drawnOutline()).toEqual([
      [-180, MAP_MAX_LATITUDE],
      [180, MAP_MAX_LATITUDE],
      [180, -MAP_MAX_LATITUDE],
      [-180, -MAP_MAX_LATITUDE],
      [-180, MAP_MAX_LATITUDE],
    ]);
    expect(drawnCorners()).toEqual(drawnOutline().slice(0, 4));
  });

  it('shows a file partly past the edge of the map, clamping only the corners beyond it', () => {
    const reachingThePole: Georeference = [
      [-10, 88],
      [10, 88],
      [10, 80],
      [-10, 80],
    ];

    render(<MapPreviewDialog visible fileName="a.tif" georeference={reachingThePole} onClose={jest.fn()} />);

    expect(screen.queryByTestId('sh-form-message')).not.toBeInTheDocument();
    expect(drawnOutline()).toEqual([
      [-10, MAP_MAX_LATITUDE],
      [10, MAP_MAX_LATITUDE],
      [10, 80],
      [-10, 80],
      [-10, MAP_MAX_LATITUDE],
    ]);
  });

  it('explains past the north edge of the map as well', () => {
    const nearTheNorthPole = nearTheSouthPole.map(([lon, lat]) => [lon, -lat]) as Georeference;

    render(<MapPreviewDialog visible fileName="a.tif" georeference={nearTheNorthPole} onClose={jest.fn()} />);

    expect(screen.getByTestId('sh-form-message')).toBeInTheDocument();
  });

  it('renders nothing while closed', () => {
    render(<MapPreviewDialog visible={false} fileName="a.tif" georeference={inItaly} onClose={jest.fn()} />);

    expect(screen.queryByTestId('sh-dialog')).not.toBeInTheDocument();
  });
});
