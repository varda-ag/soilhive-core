import { render, screen, fireEvent } from '@testing-library/react';
import SoilhiveSimpleMap from 'components/Map/SoilhiveSimpleMap';

jest.mock('utilities/map', () => ({
  EOX_SATELLITE_MAP_STYLE: 'eox-style',
  h3ResolutionForZoomLevel: jest.fn().mockReturnValue(5),
}));

jest.mock('react-map-gl/maplibre', () => ({
  Map: ({ children, attributionControl, onRender, minZoom, maxZoom }: any) => (
    <div
      data-testid="map"
      data-attribution-control={JSON.stringify(attributionControl)}
      data-min-zoom={String(minZoom)}
      data-max-zoom={String(maxZoom)}
    >
      <div className="maplibregl-ctrl-attrib maplibregl-compact-show" ref={(el: HTMLDivElement | null) => el?.setAttribute('open', '')} />
      <button
        data-testid="trigger-render"
        onClick={() => onRender?.({ target: { getContainer: () => document.querySelector('[data-testid="map"]') } })}
      />
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
  it('sets attributionControl to compact', () => {
    render(<SoilhiveSimpleMap />);
    const map = screen.getByTestId('map');
    const attrControl = JSON.parse(map.dataset.attributionControl!);
    expect(attrControl.compact).toBe(true);
  });

  it('defaults zoom limits to the full MapLibre range', () => {
    render(<SoilhiveSimpleMap />);
    const map = screen.getByTestId('map');
    expect(map.dataset.minZoom).toBe('0');
    expect(map.dataset.maxZoom).toBe('24');
  });

  it('forwards minZoom and maxZoom props to the map', () => {
    render(<SoilhiveSimpleMap minZoom={3} maxZoom={15} />);
    const map = screen.getByTestId('map');
    expect(map.dataset.minZoom).toBe('3');
    expect(map.dataset.maxZoom).toBe('15');
  });

  it('closes the attribution control on render', () => {
    render(<SoilhiveSimpleMap />);
    const attributionEl = document.querySelector('.maplibregl-ctrl-attrib')!;
    expect(attributionEl.getAttribute('open')).not.toBeNull();

    fireEvent.click(screen.getByTestId('trigger-render'));

    expect(attributionEl.getAttribute('open')).toBeNull();
    expect(attributionEl.classList.contains('maplibregl-compact-show')).toBe(false);
  });
});
