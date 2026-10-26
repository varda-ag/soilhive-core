import { render, screen, fireEvent } from '@testing-library/react';
import SoilhiveSimpleMap from 'components/Map/SoilhiveSimpleMap';
import { bbox } from '@turf/turf';
import type { FeatureCollection } from 'geojson';

jest.mock('utilities/map', () => ({
  EOX_SATELLITE_MAP_STYLE: 'eox-style',
  h3ResolutionForZoomLevel: jest.fn().mockReturnValue(5),
}));

jest.mock('react-map-gl/maplibre', () => ({
  Map: ({ children, attributionControl, onRender, onLoad, minZoom, maxZoom, canvasContextAttributes, renderWorldCopies }: any) => (
    <div
      data-testid="map"
      data-attribution-control={JSON.stringify(attributionControl)}
      data-min-zoom={String(minZoom)}
      data-max-zoom={String(maxZoom)}
      data-preserve-drawing-buffer={String(canvasContextAttributes?.preserveDrawingBuffer)}
      data-render-world-copies={String(renderWorldCopies)}
    >
      <div className="maplibregl-ctrl-attrib maplibregl-compact-show" ref={(el: HTMLDivElement | null) => el?.setAttribute('open', '')} />
      <button
        data-testid="trigger-render"
        onClick={() => onRender?.({ target: { getContainer: () => document.querySelector('[data-testid="map"]') } })}
      />
      {/* Loads a stand-in for the MapLibre map, with what the component reads of it on load. */}
      <button
        data-testid="trigger-load"
        onClick={() =>
          onLoad?.({
            target: {
              getContainer: () => document.querySelector('[data-testid="map"]'),
              getBounds: () => ({ toArray: () => [] }),
            },
          })
        }
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

  it('draws its children inside the map', () => {
    render(
      <SoilhiveSimpleMap>
        <div data-testid="child" />
      </SoilhiveSimpleMap>,
    );

    expect(screen.getByTestId('map')).toContainElement(screen.getByTestId('child'));
  });

  it('keeps the drawing buffer only when asked, so that only a map to capture as an image pays for it', () => {
    const { unmount } = render(<SoilhiveSimpleMap />);
    expect(screen.getByTestId('map').dataset.preserveDrawingBuffer).toBe('false');
    unmount();

    render(<SoilhiveSimpleMap preserveDrawingBuffer />);
    expect(screen.getByTestId('map').dataset.preserveDrawingBuffer).toBe('true');
  });

  it('calls onLoad with the map once it has loaded', () => {
    const onLoad = jest.fn();
    render(<SoilhiveSimpleMap onLoad={onLoad} />);
    expect(onLoad).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('trigger-load'));

    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad.mock.calls[0][0].getContainer()).toBe(screen.getByTestId('map'));
  });

  describe('world copies', () => {
    const geometryFeature: FeatureCollection = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [] } }],
    };

    afterEach(() => {
      jest.mocked(bbox).mockReturnValue([0, 0, 1, 1]);
    });

    it('draws a single copy of the world for a geometry within ±180°', () => {
      render(<SoilhiveSimpleMap geometryFeature={geometryFeature} />);
      expect(screen.getByTestId('map').dataset.renderWorldCopies).toBe('false');
    });

    it('draws a single copy of the world with no geometry', () => {
      render(<SoilhiveSimpleMap />);
      expect(screen.getByTestId('map').dataset.renderWorldCopies).toBe('false');
    });

    // A single copy would cut it in two at the map's edges
    it.each([
      ['east past 180°', [157, 49, 242.5, 71.5]],
      ['west past -180°', [-203, 49, -117.5, 71.5]],
    ])('draws copies of the world for a geometry crossing the antimeridian, %s', (_, crossing) => {
      jest.mocked(bbox).mockReturnValue(crossing as [number, number, number, number]);
      render(<SoilhiveSimpleMap geometryFeature={geometryFeature} />);
      expect(screen.getByTestId('map').dataset.renderWorldCopies).toBe('true');
    });
  });
});
