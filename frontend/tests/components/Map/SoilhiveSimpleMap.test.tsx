import { render, screen } from '@testing-library/react';
import SoilhiveSimpleMap from 'components/Map/SoilhiveSimpleMap';
import { __setIsMobileLayout, __resetIsMobileLayout } from 'hooks/useDevice';

jest.mock('hooks/useDevice');

jest.mock('utilities/map', () => ({
  customAttribution: 'test-attribution',
  EOX_SATELLITE_MAP_STYLE: 'eox-style',
  h3ResolutionForZoomLevel: jest.fn().mockReturnValue(5),
}));

jest.mock('react-map-gl/maplibre', () => ({
  Map: ({ children, attributionControl }: any) => (
    <div data-testid="map" data-attribution-control={JSON.stringify(attributionControl)}>
      {children}
    </div>
  ),
  NavigationControl: () => null,
  Source: ({ children }: any) => <>{children}</>,
  Layer: () => null,
  Marker: ({ children }: any) => <>{children}</>,
}));

jest.mock('components/Map/GeocoderControl', () => ({ __esModule: true, default: () => null }));

jest.mock('utilities/geo', () => ({
  bBoxToH3Cells: jest.fn().mockReturnValue([]),
  h3IndexesToGeoJSONPolygons: jest.fn().mockReturnValue({ type: 'FeatureCollection', features: [] }),
  largestPolygon: jest.fn(),
}));

jest.mock('utilities/simplifyGeometry', () => ({ simplifyGeometry: jest.fn(g => g) }));

jest.mock('@turf/turf', () => ({ bbox: jest.fn().mockReturnValue([0, 0, 1, 1]) }));

describe('SoilhiveSimpleMap', () => {
  afterEach(() => {
    __resetIsMobileLayout();
  });

  it('includes customAttribution in attributionControl on desktop', () => {
    render(<SoilhiveSimpleMap />);
    const map = screen.getByTestId('map');
    const attrControl = JSON.parse(map.dataset.attributionControl!);
    expect(attrControl.compact).toBe(false);
    expect(attrControl.customAttribution).toBe('test-attribution');
  });

  it('omits customAttribution from attributionControl on mobile', () => {
    __setIsMobileLayout(true);
    render(<SoilhiveSimpleMap />);
    const map = screen.getByTestId('map');
    const attrControl = JSON.parse(map.dataset.attributionControl!);
    expect(attrControl.compact).toBe(false);
    expect(attrControl.customAttribution).toBeUndefined();
  });
});
