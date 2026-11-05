import useAvailability from 'hooks/useAvailability';
import useAvailabilityMap from 'hooks/useAvailabilityMap';
import type { SigninPageState } from '../auth/signinPageState';
import { AVAILABILITY_MAP_SIGNIN_STATE_KEY, type AvailabilityMapSigninState } from '../contexts/AvailabilityMapContext';
import { AVAILABILITY_SIGNIN_STATE_KEY, type AvailabilitySigninState } from '../contexts/AvailabilityContext';

/**
 * The map's selection and filters as they stand, for a sign-in to carry: under OIDC the sign-in reloads
 * the app, and the visitor comes back to the page they were on with them, as on the legacy platform
 * (docs/adr/0075).
 */
export function useAvailabilitySigninState(): () => SigninPageState {
  const map = useAvailabilityMap();
  const availability = useAvailability();

  return () => {
    const mapState: AvailabilityMapSigninState = {
      selection: map.selection,
      geometryFilter: map.geometryFilter,
      boundingBox: map.boundingBox,
      selectionType: map.selectionType,
      locationName: map.locationName,
      showSelectionToolbar: map.showSelectionToolbar,
      isDaiEnabled: map.isDaiEnabled,
      daiOpacity: map.daiOpacity,
    };
    const availabilityState: AvailabilitySigninState = {
      selectedDatasets: availability.selectedDatasets,
      isAllSelected: availability.isAllSelected,
      searchValue: availability.searchValue,
      datasetFrontendFilters: availability.datasetFrontendFilters,
      datasetFilters: availability.datasetFilters,
      selectedSoilProperties: availability.selectedSoilProperties,
      selectedTimeFilter: availability.selectedTimeFilter,
    };
    return { [AVAILABILITY_MAP_SIGNIN_STATE_KEY]: mapState, [AVAILABILITY_SIGNIN_STATE_KEY]: availabilityState };
  };
}
