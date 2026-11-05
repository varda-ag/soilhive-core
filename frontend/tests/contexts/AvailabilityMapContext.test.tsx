import { renderHook } from '@testing-library/react';
import { bboxPolygon } from '@turf/turf';
import type { Polygon } from 'geojson';
import useTheme from 'hooks/useTheme';
import useAvailabilityMap from 'hooks/useAvailabilityMap';
import {
  AVAILABILITY_MAP_SIGNIN_STATE_KEY,
  AvailabilityMapProvider,
  type AvailabilityMapSigninState,
} from '../../src/contexts/AvailabilityMapContext';
import { setRestoredPageState } from '../../src/auth/signinPageState';

jest.mock('hooks/useTheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const initialBbox: [number, number, number, number] = [-20, -40, 60, 40];
const loadedTheme = { themeConfig: { initialBbox, daiConfig: { isEnabled: true, defaultValue: true } }, isLoadingThemeConfig: false };

const nakuru: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [36, -0.4],
      [36.2, -0.4],
      [36.2, -0.2],
      [36, -0.4],
    ],
  ],
};
const restoredState: AvailabilityMapSigninState = {
  selection: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: nakuru, properties: {} }] },
  geometryFilter: [nakuru],
  boundingBox: [36, -0.4, 36.2, -0.2],
  selectionType: 'country',
  locationName: 'Nakuru, Kenya',
  showSelectionToolbar: true,
  isDaiEnabled: false,
  daiOpacity: 40,
};

describe('AvailabilityMapProvider', () => {
  beforeEach(() => (useTheme as jest.Mock).mockReturnValue(loadedTheme));
  afterEach(() => setRestoredPageState(undefined));

  it('starts from the whole initial area of the theme config', () => {
    const { result } = renderHook(() => useAvailabilityMap(), { wrapper: AvailabilityMapProvider });

    expect(result.current.selection.features).toEqual([]);
    expect(result.current.boundingBox).toEqual(initialBbox);
    expect(result.current.geometryFilter).toEqual([bboxPolygon(initialBbox).geometry]);
    expect(result.current.selectedPoint).toBeNull();
  });

  it('puts back the selection a sign-in started from the map carried (docs/adr/0075)', () => {
    setRestoredPageState({ [AVAILABILITY_MAP_SIGNIN_STATE_KEY]: restoredState });

    const { result } = renderHook(() => useAvailabilityMap(), { wrapper: AvailabilityMapProvider });

    expect(result.current).toMatchObject(restoredState);
    // The area card stays closed until a click in the selection
    expect(result.current.selectedPoint).toBeNull();
  });

  it('keeps that selection when the theme config finishes loading after it', () => {
    setRestoredPageState({ [AVAILABILITY_MAP_SIGNIN_STATE_KEY]: restoredState });
    (useTheme as jest.Mock).mockReturnValue({ ...loadedTheme, isLoadingThemeConfig: true });

    const { result, rerender } = renderHook(() => useAvailabilityMap(), { wrapper: AvailabilityMapProvider });
    (useTheme as jest.Mock).mockReturnValue(loadedTheme);
    rerender();

    expect(result.current.boundingBox).toEqual(restoredState.boundingBox);
    expect(result.current.geometryFilter).toEqual(restoredState.geometryFilter);
    expect(result.current.isDaiEnabled).toBe(false);
  });
});
