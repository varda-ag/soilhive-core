import { renderHook } from '@testing-library/react';
import useAvailability from 'hooks/useAvailability';
import useAvailabilityMap from 'hooks/useAvailabilityMap';
import { useAvailabilitySigninState } from 'hooks/useAvailabilitySigninState';

jest.mock('hooks/useAvailability', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('hooks/useAvailabilityMap', () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe('useAvailabilitySigninState', () => {
  const mapState = {
    selection: { type: 'FeatureCollection', features: [] },
    geometryFilter: [],
    boundingBox: [36, -0.4, 36.2, -0.2],
    selectionType: 'country',
    locationName: 'Nakuru, Kenya',
    showSelectionToolbar: true,
    isDaiEnabled: true,
    daiOpacity: 80,
  };
  const availabilityState = {
    selectedDatasets: ['a'],
    isAllSelected: false,
    searchValue: 'soil',
    datasetFrontendFilters: { type: [], visibility: ['public'] },
    datasetFilters: { visibility: ['public'] },
    selectedSoilProperties: ['ph'],
    selectedTimeFilter: { min: 2000 },
  };

  it("takes the map's selection and filters as they stand, without the rest of the contexts", () => {
    (useAvailabilityMap as jest.Mock).mockReturnValue({
      ...mapState,
      selectedPoint: { lng: 36.1, lat: -0.3 },
      selectedH3Cell: { id: 'cell' },
      h3Cells: { type: 'FeatureCollection', features: [] },
      setSelection: jest.fn(),
    });
    (useAvailability as jest.Mock).mockReturnValue({
      ...availabilityState,
      availableDatasets: [],
      filterId: 'f1',
      selectDataset: jest.fn(),
    });

    const getState = renderHook(() => useAvailabilitySigninState()).result.current;

    // Plain data, so it survives the sign-in's storage
    expect(JSON.parse(JSON.stringify(getState()))).toEqual({
      availabilityMap: mapState,
      availability: availabilityState,
    });
  });
});
