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
import useAvailabilityData from 'hooks/useAvailabilityData';
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
jest.mock('hooks/useAvailabilityData', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock('hooks/useEntitlementsHook', () => ({ useEntitlements: jest.fn() }));

let mockSplitFilteringQueries = false;
jest.mock('utilities/environmentVariables', () => ({
  get SPLIT_FILTERING_QUERIES() {
    return mockSplitFilteringQueries;
  },
}));

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
    mockSplitFilteringQueries = false;
    (useAuthContext as jest.Mock).mockReturnValue({ isAuthenticated: true });
    (useAvailabilityMap as jest.Mock).mockReturnValue({ geometryFilter: [] });
    (useAvailabilityData as jest.Mock).mockReturnValue({ setAvailabilityData: jest.fn() });
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

  it('pushes soil properties, categories, raster categories and visible datasets into AvailabilityDataContext', () => {
    const setAvailabilityData = jest.fn();
    (useAvailabilityData as jest.Mock).mockReturnValue({ setAvailabilityData });

    renderHook(() => useAvailability(), { wrapper: AvailabilityProvider });

    expect(setAvailabilityData).toHaveBeenLastCalledWith({
      soilProperties: [],
      isLoadingSoilProperties: false,
      categories: [],
      isLoadingCategories: false,
      rasterCategories: [],
      isLoadingRasterCategories: false,
      visibleDatasets: expect.arrayContaining([
        expect.objectContaining({ id: publicDataset.id }),
        expect.objectContaining({ id: privateDownloadableDataset.id }),
        expect.objectContaining({ id: privateNonDownloadableDataset.id }),
        expect.objectContaining({ id: privatePreviewOnlyDataset.id }),
      ]),
      isLoadingVisibleDatasets: false,
    });
  });

  it('propagates loading flags for soil properties, categories and raster categories into AvailabilityDataContext', () => {
    const setAvailabilityData = jest.fn();
    (useAvailabilityData as jest.Mock).mockReturnValue({ setAvailabilityData });
    (useSoilProperties as jest.Mock).mockReturnValue({ data: undefined, isLoading: true });
    (usePropertiesCategories as jest.Mock).mockReturnValue({ data: undefined, isLoading: true });
    (useRaster as jest.Mock).mockReturnValue({ allCategories: undefined, isLoading: true, setCategoryActive: jest.fn() });

    renderHook(() => useAvailability(), { wrapper: AvailabilityProvider });

    expect(setAvailabilityData).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isLoadingSoilProperties: true,
        isLoadingCategories: true,
        isLoadingRasterCategories: true,
      }),
    );
  });

  it('isDatasetsLoading follows the full coverage query by default', () => {
    (useFilteredCoverageQuery as jest.Mock).mockImplementation((_filterId: string, geometryOnly?: boolean) => ({
      data: undefined,
      isLoading: !geometryOnly,
    }));
    (useFilteredDatasetsQuery as jest.Mock).mockReturnValue({ data: [], isLoading: false });

    const { result } = renderHook(() => useAvailability(), { wrapper: AvailabilityProvider });

    expect(result.current.isDatasetsLoading).toBe(true);
  });

  it('isDatasetsLoading ignores the geometry-only coverage query by default', () => {
    (useFilteredCoverageQuery as jest.Mock).mockImplementation((_filterId: string, geometryOnly?: boolean) => ({
      data: undefined,
      isLoading: !!geometryOnly,
    }));

    const { result } = renderHook(() => useAvailability(), { wrapper: AvailabilityProvider });

    expect(result.current.isDatasetsLoading).toBe(false);
  });

  it('isDatasetsLoading follows the datasets query when SPLIT_FILTERING_QUERIES is set', () => {
    mockSplitFilteringQueries = true;
    (useFilteredCoverageQuery as jest.Mock).mockReturnValue({ data: undefined, isLoading: true });
    (useFilteredDatasetsQuery as jest.Mock).mockReturnValue({ data: [], isLoading: false });

    const { result } = renderHook(() => useAvailability(), { wrapper: AvailabilityProvider });

    expect(result.current.isDatasetsLoading).toBe(false);
  });

  it('isNoFilteredData is true when criteria are set and coverage returns no datasets', () => {
    (useFilteredCoverageQuery as jest.Mock).mockReturnValue({ data: { datasets: [], raster_filters: {} }, isLoading: false });

    const { result } = renderHook(() => useAvailability(), { wrapper: AvailabilityProvider });

    act(() => {
      result.current.setDatasetFilters({ soil_properties: ['property-1'] });
    });

    expect(result.current.isNoFilteredData).toBe(true);
  });
});
