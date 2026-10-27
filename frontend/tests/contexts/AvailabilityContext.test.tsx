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
import { Capability, GISDataType, type FilterCriteria, type FilteredDatasetSummary } from 'types/backend';

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

  it('availableDatasets is narrowed by the search when nothing is selected', () => {
    const { result } = renderHook(() => useAvailability(), { wrapper: AvailabilityProvider });

    act(() => {
      result.current.setSearchValue('private');
    });

    const availableIds = result.current.availableDatasets.map(dataset => dataset.id);
    expect(availableIds.sort()).toEqual([privateDownloadableDataset.id, privatePreviewOnlyDataset.id].sort());
  });

  it('availableDatasets keeps only the selected datasets matching the search', () => {
    const { result } = renderHook(() => useAvailability(), { wrapper: AvailabilityProvider });

    act(() => {
      result.current.selectDataset(publicDataset.id);
    });
    act(() => {
      result.current.selectDataset(privateDownloadableDataset.id);
    });
    act(() => {
      result.current.setSearchValue('private');
    });

    expect(result.current.availableDatasets.map(dataset => dataset.id)).toEqual([privateDownloadableDataset.id]);
  });

  it('availableDatasets falls back to all datasets matching the search when the search hides every selected one', () => {
    const { result } = renderHook(() => useAvailability(), { wrapper: AvailabilityProvider });

    act(() => {
      result.current.selectDataset(publicDataset.id);
    });
    act(() => {
      result.current.setSearchValue('private');
    });

    const availableIds = result.current.availableDatasets.map(dataset => dataset.id);
    expect(availableIds.sort()).toEqual([privateDownloadableDataset.id, privatePreviewOnlyDataset.id].sort());
  });

  it('availableDatasets is empty when the search matches nothing', () => {
    const { result } = renderHook(() => useAvailability(), { wrapper: AvailabilityProvider });

    act(() => {
      result.current.setSearchValue('no such dataset');
    });

    expect(result.current.availableDatasets).toEqual([]);
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

  describe('data scope selection', () => {
    const rasterPrivateDataset: FilteredDatasetSummary = {
      id: 'dataset-raster-private',
      name: 'Raster Private Dataset',
      data_type: GISDataType.RASTER,
      visibility: 'private',
      dataset_layer_count: 0,
      raster_layer_count: 7,
    };

    beforeEach(() => {
      capabilitiesById[rasterPrivateDataset.id] = [Capability.DOWNLOAD];
      (useFilteredCoverageQuery as jest.Mock).mockReturnValue({
        data: { datasets: [publicDataset, privateDownloadableDataset, rasterPrivateDataset], raster_filters: {} },
        isLoading: false,
      });
    });

    afterAll(() => {
      delete capabilitiesById[rasterPrivateDataset.id];
    });

    it('datasetsSummary counts only the datasets of the selected data type', () => {
      const { result } = renderHook(() => useAvailability(), { wrapper: AvailabilityProvider });

      act(() => {
        result.current.setFrontendFilters([GISDataType.RASTER], 'type');
      });

      expect(result.current.datasetsSummary.count).toBe(1);
      expect(result.current.datasetsSummary.layers).toBe(7);
      expect(result.current.datasetsSummary.dataPoints).toBe(0);
    });

    it('availableDatasets and selectAllDatasets exclude datasets outside the selected visibility', () => {
      const { result } = renderHook(() => useAvailability(), { wrapper: AvailabilityProvider });

      act(() => {
        result.current.setFrontendFilters(['public'], 'visibility');
      });
      act(() => {
        result.current.selectAllDatasets(true);
      });

      expect(result.current.availableDatasets.map(dataset => dataset.id)).toEqual([publicDataset.id]);
      expect(result.current.selectedDatasets).toEqual([publicDataset.id]);
    });

    it('filteredDatasets keeps only the datasets of the selected data type', () => {
      const { result } = renderHook(() => useAvailability(), { wrapper: AvailabilityProvider });

      act(() => {
        result.current.setFrontendFilters([GISDataType.RASTER], 'type');
      });

      expect(result.current.filteredDatasets.map(dataset => dataset.id)).toEqual([rasterPrivateDataset.id]);
    });

    it('isNoFilteredData is true when no dataset matches both the data type and the visibility', () => {
      const { result } = renderHook(() => useAvailability(), { wrapper: AvailabilityProvider });

      act(() => {
        result.current.setFrontendFilters([GISDataType.RASTER], 'type');
      });
      act(() => {
        result.current.setFrontendFilters(['public'], 'visibility');
      });

      expect(result.current.isNoFilteredData).toBe(true);
    });

    it('narrows the datasets query results the same way when SPLIT_FILTERING_QUERIES is set', () => {
      mockSplitFilteringQueries = true;
      (useFilteredCoverageQuery as jest.Mock).mockReturnValue({ data: undefined, isLoading: false });
      (useFilteredDatasetsQuery as jest.Mock).mockReturnValue({
        data: [publicDataset, privateDownloadableDataset, rasterPrivateDataset],
        isLoading: false,
      });
      const { result } = renderHook(() => useAvailability(), { wrapper: AvailabilityProvider });

      act(() => {
        result.current.setFrontendFilters([GISDataType.POINT], 'type');
      });
      act(() => {
        result.current.selectAllDatasets(true);
      });

      expect(result.current.datasetsSummary.count).toBe(2);
      expect(result.current.selectedDatasets.sort()).toEqual([privateDownloadableDataset.id, publicDataset.id].sort());
    });
  });

  describe('coverage filter', () => {
    const FULL_FILTER_ID = 'full-filter';
    const COVERAGE_FILTER_ID = 'coverage-filter';
    const hasScopeCriteria = (parameters: FilterCriteria) => 'data_types' in parameters || 'visibility' in parameters;

    // Payloads carrying data_types/visibility get the full filter id; the others get the coverage filter id
    const mockDataFilterQuery = (isLoadingFullFilter = false) => {
      (useDataFilterQuery as jest.Mock).mockImplementation(({ parameters }: { parameters: FilterCriteria }) =>
        hasScopeCriteria(parameters)
          ? { filterId: FULL_FILTER_ID, selectedFilters: undefined, isLoading: isLoadingFullFilter }
          : { filterId: COVERAGE_FILTER_ID, selectedFilters: undefined, isLoading: false },
      );
    };

    it('keeps data_types out of the coverage filter payload and in the full filter payload', () => {
      mockDataFilterQuery();
      const { result } = renderHook(() => useAvailability(), { wrapper: AvailabilityProvider });
      jest.mocked(useDataFilterQuery).mockClear();

      act(() => {
        result.current.setFrontendFilters(['raster'], 'type');
      });

      const payloads = jest.mocked(useDataFilterQuery).mock.calls.map(([payload]) => payload.parameters);
      expect(payloads).toContainEqual({});
      expect(payloads).toContainEqual({ data_types: ['raster'] });
      expect(result.current.filterId).toBe(FULL_FILTER_ID);
    });

    it('queries coverage and datasets with the coverage filter id', () => {
      mockDataFilterQuery();
      const { result } = renderHook(() => useAvailability(), { wrapper: AvailabilityProvider });
      jest.mocked(useFilteredCoverageQuery).mockClear();
      jest.mocked(useFilteredDatasetsQuery).mockClear();

      act(() => {
        result.current.setFrontendFilters(['public'], 'visibility');
      });

      const coverageIds = jest.mocked(useFilteredCoverageQuery).mock.calls.map(([id]) => id);
      const datasetsIds = jest.mocked(useFilteredDatasetsQuery).mock.calls.map(([id]) => id);
      expect(coverageIds.length).toBeGreaterThan(0);
      expect(new Set([...coverageIds, ...datasetsIds])).toEqual(new Set([COVERAGE_FILTER_ID]));
    });

    it('does not ask for geometry-only coverage when only scope criteria are set', () => {
      mockDataFilterQuery();
      const { result } = renderHook(() => useAvailability(), { wrapper: AvailabilityProvider });

      act(() => {
        result.current.setFrontendFilters(['raster'], 'type');
      });

      const geometryOnlyFlags = jest.mocked(useFilteredCoverageQuery).mock.calls.map(([, geometryOnly]) => !!geometryOnly);
      expect(geometryOnlyFlags).not.toContain(true);
    });

    it('coverage loading flags ignore the full filter loading, isLoadingFilterId follows it', () => {
      mockDataFilterQuery(true);
      const { result } = renderHook(() => useAvailability(), { wrapper: AvailabilityProvider });

      act(() => {
        result.current.setFrontendFilters(['raster'], 'type');
      });

      expect(result.current.isCoverageLoading).toBe(false);
      expect(result.current.isDatasetsLoading).toBe(false);
      expect(result.current.isLoadingPartialFilter).toBe(false);
      expect(result.current.isLoadingFilterId).toBe(true);
    });
  });
});
