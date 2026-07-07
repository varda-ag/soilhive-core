import { render, screen, fireEvent } from '@testing-library/react';
import SoilhiveMap from 'components/Map/SoilhiveMap';
import { __setIsMobileLayout, __setIsDesktopLayout, __resetIsMobileLayout } from 'hooks/useDevice';
import useTheme from 'hooks/useTheme';

jest.mock('hooks/useDevice');

jest.mock('utilities/map', () => ({
  customAttribution: 'test-attribution',
  getMapStyles: jest.fn().mockReturnValue([{ name: 'Default', mapStyle: 'default-style' }]),
  h3ResolutionForZoomLevel: jest.fn().mockReturnValue(5),
}));

jest.mock('react-map-gl/maplibre', () => ({
  Map: ({ children, attributionControl, onRender }: any) => (
    <div data-testid="map" data-attribution-control={JSON.stringify(attributionControl)}>
      <div className="maplibregl-ctrl-attrib maplibregl-compact-show" ref={(el: HTMLDivElement | null) => el?.setAttribute('open', '')} />
      <button
        data-testid="trigger-render"
        onClick={() => onRender?.({ target: { getContainer: () => document.querySelector('[data-testid="map"]') } })}
      />
      {children}
    </div>
  ),
  NavigationControl: () => null,
  GeolocateControl: () => null,
  ScaleControl: () => null,
  Source: ({ children }: any) => <>{children}</>,
  Layer: () => null,
}));

jest.mock('maplibre-gl', () => ({
  LngLat: jest.fn(),
  LngLatBounds: jest.fn(),
}));

jest.mock('hooks/useAvailabilityMap', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue({
    selectedPoint: null,
    selectedH3Cell: null,
    h3Cells: null,
    emptySelection: { type: 'FeatureCollection', features: [] },
    selection: { type: 'FeatureCollection', features: [] },
    showDrawControl: false,
    showSelectionToolbar: false,
    selectionType: 'drawn-polygon',
    setSelectedPoint: jest.fn(),
    setSelectedH3Cell: jest.fn(),
    setH3Cells: jest.fn(),
    setSelection: jest.fn(),
    setShowDrawControl: jest.fn(),
    setShowSelectionToolbar: jest.fn(),
    setSelectionType: jest.fn(),
  }),
}));

jest.mock('hooks/useAvailability', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue({ filterId: undefined }),
}));

jest.mock('hooks/useDai', () => ({
  useDai: jest.fn().mockReturnValue({ dai: null }),
}));

jest.mock('hooks/useTheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('components/DrawControl', () => ({ __esModule: true, default: () => null }));
jest.mock('components/Map/SoilhiveMapToolbar', () => ({ __esModule: true, default: () => null }));
jest.mock('components/Map/SoilhiveMapSelectionToolbar', () => ({ __esModule: true, default: () => null }));
jest.mock('components/Map/AreaInfo', () => ({ AreaInfoPopup: () => null, AreaInfoBar: () => null }));
jest.mock('components/Map/MapStyleSwitcher/MapStyleSwitcher', () => ({
  __esModule: true,
  MapStyleSwitcher: () => <div data-testid="map-style-switcher" />,
}));
jest.mock('components/Map/DaiWidget/DaiWidget', () => ({ __esModule: true, DaiWidget: () => <div data-testid="dai-widget" /> }));
jest.mock('components/Map/GeocoderControl', () => ({ __esModule: true, default: () => null }));

jest.mock('utilities/geo', () => ({
  bBoxToH3Cells: jest.fn().mockReturnValue([]),
  h3IndexesToGeoJSONPolygons: jest.fn().mockReturnValue({ type: 'FeatureCollection', features: [] }),
  dataAvailabilityIndexToGeoJSONPolygons: jest.fn().mockReturnValue({ type: 'FeatureCollection', features: [] }),
  isPointInFeatureCollection: jest.fn().mockReturnValue(false),
  largestPolygon: jest.fn(),
}));

jest.mock('utilities/simplifyGeometry', () => ({ simplifyGeometry: jest.fn(g => g) }));

jest.mock('@turf/turf', () => ({
  bbox: jest.fn().mockReturnValue([0, 0, 1, 1]),
  centerOfMass: jest.fn().mockReturnValue({ geometry: { coordinates: [0, 0] } }),
}));

describe('SoilhiveMap', () => {
  beforeEach(() => {
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: false,
      themeConfig: {
        daiConfig: {
          isEnabled: true,
          defaultValue: false,
        },
      },
    });
  });
  afterEach(() => {
    __resetIsMobileLayout();
    jest.clearAllMocks();
  });

  it('includes customAttribution in attributionControl on desktop', () => {
    render(<SoilhiveMap />);
    const map = screen.getByTestId('map');
    const attrControl = JSON.parse(map.dataset.attributionControl!);
    expect(attrControl.compact).toBe(false);
    expect(attrControl.customAttribution).toBe('test-attribution');
  });

  it('omits customAttribution from attributionControl on mobile', () => {
    __setIsMobileLayout(true);
    render(<SoilhiveMap />);
    const map = screen.getByTestId('map');
    const attrControl = JSON.parse(map.dataset.attributionControl!);
    expect(attrControl.compact).toBe(true);
    expect(attrControl.customAttribution).toBeUndefined();
  });

  it('closes the attribution control on render when on mobile', () => {
    __setIsMobileLayout(true);
    render(<SoilhiveMap />);
    const attributionEl = document.querySelector('.maplibregl-ctrl-attrib')!;
    expect(attributionEl.getAttribute('open')).not.toBeNull();

    fireEvent.click(screen.getByTestId('trigger-render'));

    expect(attributionEl.getAttribute('open')).toBeNull();
    expect(attributionEl.classList.contains('maplibregl-compact-show')).toBe(false);
  });

  it('does not touch the attribution control on render when on desktop', () => {
    render(<SoilhiveMap />);
    const attributionEl = document.querySelector('.maplibregl-ctrl-attrib')!;

    fireEvent.click(screen.getByTestId('trigger-render'));

    expect(attributionEl.getAttribute('open')).not.toBeNull();
    expect(attributionEl.classList.contains('maplibregl-compact-show')).toBe(true);
  });

  it('renders DaiWidget if DAI is enabled in the config', () => {
    __setIsDesktopLayout(true);

    render(<SoilhiveMap />);

    expect(screen.getByTestId('dai-widget')).toBeInTheDocument();
  });

  it('does not render DaiWidget if DAI is disabled in the config', () => {
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: false,
      themeConfig: {
        daiConfig: {
          isEnabled: false,
          defaultValue: false,
        },
      },
    });
    __setIsDesktopLayout(true);

    render(<SoilhiveMap />);

    expect(screen.queryByTestId('dai-widget')).not.toBeInTheDocument();
  });
});
