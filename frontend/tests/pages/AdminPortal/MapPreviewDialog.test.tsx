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

jest.mock('components/Map/SoilhiveSimpleMap', () => ({
  __esModule: true,
  default: () => <div data-testid="sh-simple-map" />,
}));

jest.mock('react-map-gl/maplibre', () => ({
  Source: () => null,
  Layer: () => null,
}));

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

  it('renders nothing while closed', () => {
    render(<MapPreviewDialog visible={false} fileName="a.tif" georeference={inItaly} onClose={jest.fn()} />);

    expect(screen.queryByTestId('sh-dialog')).not.toBeInTheDocument();
  });
});
