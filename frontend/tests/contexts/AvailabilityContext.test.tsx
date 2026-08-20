import { act, renderHook } from '@testing-library/react';
import { AvailabilityProvider } from '../../src/contexts/AvailabilityContext';
import useAvailability from 'hooks/useAvailability';
import { useAuthContext } from '../../src/auth/AuthContextProvider';
import { useDataFilterQuery } from 'hooks/useDataFilterQuery';
import { useFilteredCoverageQuery } from 'hooks/useFilteredCoverageQuery';
import { useFilteredDatasetsQuery } from 'hooks/useFilteredDatasetsQuery';
import { useSoilProperties } from 'hooks/useSoilProperties';
import { usePropertiesCategories } from 'hooks/usePropertiesCategories';
import { useRaster } from 'hooks/useRaster';
import useAvailabilityMap from 'hooks/useAvailabilityMap';
import { useEntitlements } from 'hooks/useEntitlementsHook';
import { Capability, GISDataType, type FilteredDatasetSummary } from 'types/backend';

jest.mock('../../src/auth/AuthContextProvider', () => ({
  useAuthContext: jest.fn(),
}));
jest.mock('hooks/useDataFilterQuery', () => ({ useDataFilterQuery: jest.fn() }));
jest.mock('hooks/useFilteredCoverageQuery', () => ({ useFilteredCoverageQuery: jest.fn() }));
jest.mock('hooks/useFilteredDatasetsQuery', () => ({ useFilteredDatasetsQuery: jest.fn() }));
jest.mock('hooks/useSoilProperties', () => ({ useSoilProperties: jest.fn() }));
jest.mock('hooks/usePropertiesCategories', () => ({ usePropertiesCategories: jest.fn() }));
jest.mock('hooks/useRaster', () => ({ useRaster: jest.fn() }));
jest.mock('hooks/useAvailabilityMap', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock('hooks/useEntitlementsHook', () => ({ useEntitlements: jest.fn() }));

const publicDataset: FilteredDatasetSummary = {
  id: 'dataset-public',
  name: 'Public Dataset',
  data_type: GISDataType.POINT,
  visibility: 'public',
  dataset_layer_count: 1,
  raster_layer_count: 0,
};

const privateDownloadableDataset: FilteredDatasetSummary = {
  id: 'dataset-private-downloadable',
  name: 'Private Downloadable Dataset',
  data_type: GISDataType.POINT,
  visibility: 'private',
  dataset_layer_count: 1,
  raster_layer_count: 0,
};

const privateNonDownloadableDataset: FilteredDatasetSummary = {
  id: 'dataset-private-non-downloadable',
  name: 'Private Non-downloadable Dataset',
  data_type: GISDataType.POINT,
  visibility: 'private',
  dataset_layer_count: 1,
  raster_layer_count: 0,
};

const privatePreviewOnlyDataset: FilteredDatasetSummary = {
  id: 'dataset-private-preview-only',
  name: 'Private Preview-only Dataset',
  data_type: GISDataType.POINT,
  visibility: 'private',
  dataset_layer_count: 1,
  raster_layer_count: 0,
};

// Entitlements map backing the mocked `can()`, keyed by dataset id. `publicDataset` has no
// entry: public access comes from `visibility`, not from an entitlements row.
const capabilitiesById: Record<string, Capability[]> = {
  [privateDownloadableDataset.id]: [Capability.DOWNLOAD],
  [privateNonDownloadableDataset.id]: [],
  [privatePreviewOnlyDataset.id]: [Capability.PREVIEW],
};

describe('AvailabilityContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuthContext as jest.Mock).mockReturnValue({ isAuthenticated: true });
    (useAvailabilityMap as jest.Mock).mockReturnValue({ geometryFilter: [] });
    (useDataFilterQuery as jest.Mock).mockReturnValue({ filterId: 'filter-1', selectedFilters: undefined, isLoading: false });
    (useFilteredCoverageQuery as jest.Mock).mockReturnValue({
      data: {
        datasets: [publicDataset, privateDownloadableDataset, privateNonDownloadableDataset, privatePreviewOnlyDataset],
        raster_filters: {},
      },
      isLoading: false,
    });
    (useFilteredDatasetsQuery as jest.Mock).mockReturnValue({ data: undefined, isLoading: false });
    (useSoilProperties as jest.Mock).mockReturnValue({ data: [], isLoading: false });
    (usePropertiesCategories as jest.Mock).mockReturnValue({ data: [], isLoading: false });
    (useRaster as jest.Mock).mockReturnValue({ allCategories: [], isLoading: false, setCategoryActive: jest.fn() });
    (useEntitlements as jest.Mock).mockReturnValue({
      can: (capability: Capability, id?: string) => (id ? (capabilitiesById[id] ?? []).includes(capability) : false),
      isLoading: false,
    });
  });

  it('availableDatasets includes datasets with the download or the preview capability', () => {
    const { result } = renderHook(() => useAvailability(), { wrapper: AvailabilityProvider });

    const availableIds = result.current.availableDatasets.map(dataset => dataset.id);
    expect(availableIds).toContain(publicDataset.id);
    expect(availableIds).toContain(privateDownloadableDataset.id);
    expect(availableIds).toContain(privatePreviewOnlyDataset.id);
    expect(availableIds).not.toContain(privateNonDownloadableDataset.id);
  });

  it('selectAllDatasets(true) selects datasets with the download or the preview capability', () => {
    const { result } = renderHook(() => useAvailability(), { wrapper: AvailabilityProvider });

    act(() => {
      result.current.selectAllDatasets(true);
    });

    expect(result.current.selectedDatasets.sort()).toEqual(
      [privateDownloadableDataset.id, publicDataset.id, privatePreviewOnlyDataset.id].sort(),
    );
    expect(result.current.selectedDatasets).not.toContain(privateNonDownloadableDataset.id);
  });
});
