import { render, screen, fireEvent, act } from '@testing-library/react';
import SoilhiveMap from 'components/Map/SoilhiveMap';
import { __setIsMobileLayout, __setIsDesktopLayout, __resetIsMobileLayout, __resetIsDesktopLayout } from 'hooks/useDevice';
import useTheme from 'hooks/useTheme';

jest.mock('hooks/useDevice');

jest.mock('utilities/map', () => ({
  getMapStyles: jest.fn().mockReturnValue([{ name: 'Default', mapStyle: 'default-style' }]),
  h3ResolutionForZoomLevel: jest.fn().mockReturnValue(5),
}));

jest.mock('react-map-gl/maplibre', () => ({
  Map: ({ children, attributionControl, onRender, onZoomStart, onZoomEnd }: any) => (
    <div data-testid="map" data-attribution-control={JSON.stringify(attributionControl)}>
      <div className="maplibregl-ctrl-attrib maplibregl-compact-show" ref={(el: HTMLDivElement | null) => el?.setAttribute('open', '')} />
      <button
        data-testid="trigger-render"
        onClick={() => onRender?.({ target: { getContainer: () => document.querySelector('[data-testid="map"]') } })}
      />
      <button data-testid="trigger-zoom-start" onClick={() => onZoomStart?.()} />
      <button
        data-testid="trigger-zoom-end"
        onClick={() =>
          onZoomEnd?.({
            target: {
              getBounds: () => ({
                toArray: () => [
                  [0, 0],
                  [1, 1],
                ],
              }),
              getZoom: () => 5,
            },
            originalEvent: undefined,
          })
        }
      />
      {children}
    </div>
  ),
  NavigationControl: () => null,
  GeolocateControl: () => null,
  ScaleControl: ({ style }: any) => <div data-testid="scale-control" style={style} />,
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
    isDaiEnabled: false,
    daiOpacity: 80,
    setSelectedPoint: jest.fn(),
    setSelectedH3Cell: jest.fn(),
    setH3Cells: jest.fn(),
    setSelection: jest.fn(),
    setShowDrawControl: jest.fn(),
    setShowSelectionToolbar: jest.fn(),
    setSelectionType: jest.fn(),
    setIsDaiEnabled: jest.fn(),
    setDaiOpacity: jest.fn(),
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
    __resetIsDesktopLayout();
    jest.clearAllMocks();
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

  it('does not render ScaleControl before any zoom interaction', () => {
    render(<SoilhiveMap />);
    expect(screen.queryByTestId('scale-control')).not.toBeInTheDocument();
  });

  it('renders and makes ScaleControl visible when zoom starts', () => {
    render(<SoilhiveMap />);
    fireEvent.click(screen.getByTestId('trigger-zoom-start'));
    const scaleControl = screen.getByTestId('scale-control');
    expect(scaleControl).toBeInTheDocument();
    expect(scaleControl.style.opacity).toBe('1');
  });

  it('never renders ScaleControl when showScale is false, even after zoom start/end', () => {
    render(<SoilhiveMap showScale={false} />);
    fireEvent.click(screen.getByTestId('trigger-zoom-start'));
    expect(screen.queryByTestId('scale-control')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('trigger-zoom-end'));
    expect(screen.queryByTestId('scale-control')).not.toBeInTheDocument();
  });

  it('always renders ScaleControl on desktop, without fading, even through zoom start/end', () => {
    __setIsDesktopLayout(true);
    render(<SoilhiveMap />);

    expect(screen.getByTestId('scale-control')).toBeInTheDocument();
    expect(screen.getByTestId('scale-control').style.opacity).toBe('');

    jest.useFakeTimers();
    fireEvent.click(screen.getByTestId('trigger-zoom-start'));
    fireEvent.click(screen.getByTestId('trigger-zoom-end'));

    act(() => {
      jest.advanceTimersByTime(1000 + 300); // SCALE_LINGER_MS + SCALE_FADE_MS
    });

    expect(screen.getByTestId('scale-control')).toBeInTheDocument();
    expect(screen.getByTestId('scale-control').style.opacity).toBe('');
    jest.useRealTimers();
  });

  describe('ScaleControl fade-out timing', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('keeps ScaleControl visible immediately after zoom ends, fades it after SCALE_LINGER_MS, and unmounts it after SCALE_FADE_MS', () => {
      render(<SoilhiveMap />);
      fireEvent.click(screen.getByTestId('trigger-zoom-start'));
      fireEvent.click(screen.getByTestId('trigger-zoom-end'));

      expect(screen.getByTestId('scale-control').style.opacity).toBe('1');

      act(() => {
        jest.advanceTimersByTime(1000); // SCALE_LINGER_MS
      });
      expect(screen.getByTestId('scale-control').style.opacity).toBe('0');

      act(() => {
        jest.advanceTimersByTime(300); // SCALE_FADE_MS
      });
      expect(screen.queryByTestId('scale-control')).not.toBeInTheDocument();
    });

    it('cancels the pending hide/unmount when a new zoom starts before the timers elapse', () => {
      render(<SoilhiveMap />);
      fireEvent.click(screen.getByTestId('trigger-zoom-start'));
      fireEvent.click(screen.getByTestId('trigger-zoom-end'));

      act(() => {
        jest.advanceTimersByTime(1000); // fires the hide, schedules the unmount 300ms later
      });
      expect(screen.getByTestId('scale-control').style.opacity).toBe('0');

      fireEvent.click(screen.getByTestId('trigger-zoom-start')); // should cancel the pending unmount
      expect(screen.getByTestId('scale-control').style.opacity).toBe('1');

      act(() => {
        jest.advanceTimersByTime(300);
      });
      expect(screen.getByTestId('scale-control')).toBeInTheDocument();
      expect(screen.getByTestId('scale-control').style.opacity).toBe('1');
    });
  });
});
