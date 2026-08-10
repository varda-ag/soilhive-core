import { createRef } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import SoilhiveMap, { type SoilhiveMapRef } from 'components/Map/SoilhiveMap';
import { __setIsMobileLayout, __setIsDesktopLayout, __resetIsMobileLayout, __resetIsDesktopLayout } from 'hooks/useDevice';

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

jest.mock('components/DrawControl', () => ({ __esModule: true, default: () => null }));
jest.mock('components/Map/SoilhiveMapToolbar', () => ({ __esModule: true, default: () => null }));
jest.mock('components/Map/SoilhiveMapSelectionToolbar', () => ({ __esModule: true, default: () => null }));
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

function makeSelectionState(overrides: Record<string, any> = {}) {
  return {
    selectedPoint: null,
    setSelectedPoint: jest.fn(),
    selectedH3Cell: null,
    setSelectedH3Cell: jest.fn(),
    h3Cells: null,
    setH3Cells: jest.fn(),
    selection: { type: 'FeatureCollection', features: [] },
    setSelection: jest.fn(),
    showDrawControl: false,
    setShowDrawControl: jest.fn(),
    showSelectionToolbar: false,
    setShowSelectionToolbar: jest.fn(),
    ...overrides,
  };
}

function makeProps({ selectionState, ...rest }: Record<string, any> = {}) {
  return {
    selectionState: makeSelectionState(selectionState),
    ...rest,
  };
}

describe('SoilhiveMap', () => {
  afterEach(() => {
    __resetIsMobileLayout();
    __resetIsDesktopLayout();
    jest.clearAllMocks();
  });

  it('renders given only its controlled props, with no host context provider of any kind', () => {
    expect(() => render(<SoilhiveMap {...makeProps()} />)).not.toThrow();
  });

  it('does not render any built-in area-info card even when a point is selected (that composition now lives on the host)', () => {
    __setIsDesktopLayout(true);
    expect(() => render(<SoilhiveMap {...makeProps({ selectionState: { selectedPoint: { lng: 1, lat: 2 } } })} />)).not.toThrow();
    expect(screen.queryByTestId('sh-areainfopopup-close')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sh-areainfobar-close')).not.toBeInTheDocument();
  });

  it('renders children inside the map', () => {
    render(
      <SoilhiveMap {...makeProps()}>
        <div data-testid="plugin-overlay">custom card</div>
      </SoilhiveMap>,
    );
    expect(screen.getByTestId('plugin-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('map')).toContainElement(screen.getByTestId('plugin-overlay'));
  });

  it('renders footer as a flex sibling of the map, not nested inside it', () => {
    render(<SoilhiveMap {...makeProps()} footer={<div data-testid="footer-content">Footer</div>} />);
    expect(screen.getByTestId('footer-content')).toBeInTheDocument();
    expect(screen.getByTestId('map')).not.toContainElement(screen.getByTestId('footer-content'));
  });

  it('closes the attribution control on render when on mobile', () => {
    __setIsMobileLayout(true);
    render(<SoilhiveMap {...makeProps()} />);
    const attributionEl = document.querySelector('.maplibregl-ctrl-attrib')!;
    expect(attributionEl.getAttribute('open')).not.toBeNull();

    fireEvent.click(screen.getByTestId('trigger-render'));

    expect(attributionEl.getAttribute('open')).toBeNull();
    expect(attributionEl.classList.contains('maplibregl-compact-show')).toBe(false);
  });

  it('does not touch the attribution control on render when on desktop', () => {
    render(<SoilhiveMap {...makeProps()} />);
    const attributionEl = document.querySelector('.maplibregl-ctrl-attrib')!;

    fireEvent.click(screen.getByTestId('trigger-render'));

    expect(attributionEl.getAttribute('open')).not.toBeNull();
    expect(attributionEl.classList.contains('maplibregl-compact-show')).toBe(true);
  });

  it('renders DaiWidget when dai.showWidget is true', () => {
    __setIsDesktopLayout(true);

    render(<SoilhiveMap {...makeProps({ dai: { showWidget: true } })} />);

    expect(screen.getByTestId('dai-widget')).toBeInTheDocument();
  });

  it('renders the mobile DAI toggle button with an accessible label when dai.showWidget is true', () => {
    __setIsMobileLayout(true);

    render(<SoilhiveMap {...makeProps({ dai: { showWidget: true } })} />);

    expect(screen.getByRole('button', { name: 'Toggle DAI' })).toBeInTheDocument();
  });

  it('does not render the mobile DAI toggle button on desktop', () => {
    __setIsDesktopLayout(true);

    render(<SoilhiveMap {...makeProps({ dai: { showWidget: true } })} />);

    expect(screen.queryByRole('button', { name: 'Toggle DAI' })).not.toBeInTheDocument();
  });

  it('does not render DaiWidget when the dai prop is omitted (the plugin scenario)', () => {
    __setIsDesktopLayout(true);

    render(<SoilhiveMap {...makeProps()} />);

    expect(screen.queryByTestId('dai-widget')).not.toBeInTheDocument();
  });

  it('calls dai.onViewportChange with bbox/resolution when the viewport changes and showH3Cells is true', () => {
    const onViewportChange = jest.fn();
    render(<SoilhiveMap {...makeProps({ dai: { onViewportChange } })} showH3Cells />);

    fireEvent.click(screen.getByTestId('trigger-zoom-end'));

    expect(onViewportChange).toHaveBeenCalledWith({ bbox: [0, 0, 1, 1], resolution: 5 });
  });

  it('calls dai.onViewportChange with null when showH3Cells is false', () => {
    const onViewportChange = jest.fn();
    render(<SoilhiveMap {...makeProps({ dai: { onViewportChange } })} showH3Cells={false} />);

    fireEvent.click(screen.getByTestId('trigger-zoom-end'));

    expect(onViewportChange).toHaveBeenCalledWith(null);
  });

  it('computes and sets h3Cells on viewport change when showH3Cells is true', () => {
    const setH3Cells = jest.fn();
    render(<SoilhiveMap {...makeProps({ selectionState: { setH3Cells } })} showH3Cells />);

    fireEvent.click(screen.getByTestId('trigger-zoom-end'));

    expect(setH3Cells).toHaveBeenCalledWith({ type: 'FeatureCollection', features: [] });
  });

  it('does not render ScaleControl before any zoom interaction', () => {
    render(<SoilhiveMap {...makeProps()} />);
    expect(screen.queryByTestId('scale-control')).not.toBeInTheDocument();
  });

  it('renders and makes ScaleControl visible when zoom starts', () => {
    render(<SoilhiveMap {...makeProps()} />);
    fireEvent.click(screen.getByTestId('trigger-zoom-start'));
    const scaleControl = screen.getByTestId('scale-control');
    expect(scaleControl).toBeInTheDocument();
    expect(scaleControl.style.opacity).toBe('1');
  });

  it('never renders ScaleControl when showScale is false, even after zoom start/end', () => {
    render(<SoilhiveMap {...makeProps()} showScale={false} />);
    fireEvent.click(screen.getByTestId('trigger-zoom-start'));
    expect(screen.queryByTestId('scale-control')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('trigger-zoom-end'));
    expect(screen.queryByTestId('scale-control')).not.toBeInTheDocument();
  });

  it('always renders ScaleControl on desktop, without fading, even through zoom start/end', () => {
    __setIsDesktopLayout(true);
    render(<SoilhiveMap {...makeProps()} />);

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
      render(<SoilhiveMap {...makeProps()} />);
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
      render(<SoilhiveMap {...makeProps()} />);
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

  it('exposes onUpload via the forwarded ref', () => {
    const ref = createRef<SoilhiveMapRef>();
    render(<SoilhiveMap {...makeProps()} ref={ref} />);
    expect(ref.current).not.toBeNull();
    expect(typeof ref.current?.onUpload).toBe('function');
  });
});
