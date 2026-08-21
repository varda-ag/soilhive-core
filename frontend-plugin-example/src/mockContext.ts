import type {
  PluginConfigResult,
  PluginContext,
  PluginFilteredData,
  PluginMapSelection,
  PluginQueryResult,
  PluginRasterFilterCategory,
  PluginSoilDataResult,
  PluginSoilProperty,
  PluginSoilPropertyCategory,
  PluginTheme,
} from 'frontend-plugin-types';

/**
 * The context hooks are plain functions from the plugin's point of view, so the
 * local preview can satisfy them with static data instead of real hooks.
 */
const query = <T>(data: T): PluginQueryResult<T> => ({ data, isLoading: false, isError: false });

const mapSelection: PluginMapSelection = {
  selectedPoint: { lng: -122.4194, lat: 37.7749 },
  selectedH3Cell: null,
  selection: { type: 'FeatureCollection', features: [] },
  boundingBox: [-122.5, 37.7, -122.35, 37.85],
  geometryFilter: [],
  selectionType: 'drawn-polygon',
  locationName: 'Local Preview Area',
};

const theme: PluginTheme = {
  colors: { primary: '#2f6f4f', background: '#ffffff' },
  logoUrl: null,
};

const filteredCoverage: PluginFilteredData = {
  datasets: [
    {
      id: 'mock-dataset-id',
      name: 'Mock Dataset',
      data_type: 'point',
      visibility: 'public',
      dataset_layer_count: 1,
      raster_layer_count: 0,
    },
  ],
  raster_filters: {},
};

const soilProperties: PluginSoilProperty[] = [
  {
    id: 'mock-soil-property-id',
    property_name: 'Mock Soil Property',
    property_acronym: 'MSP',
    category_id: 'mock-category-id',
    original_units_of_measurement: {},
  },
];

const propertiesCategories: PluginSoilPropertyCategory[] = [
  {
    id: 'mock-category-id',
    slug: 'mock-category',
    category_name: 'Mock Category',
    category_acronym: 'MC',
  },
];

const rasterCategories: PluginRasterFilterCategory[] = [
  {
    id: 'land_cover',
    name: 'Land Cover',
    description: 'Mock raster category',
    enabled: true,
    active: false,
    mappings: { Artic: 1 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
  },
];

const soilData: PluginSoilDataResult = {
  data: [
    {
      id: 'mock-soil-data-id',
      dataset: 'mock-dataset-id',
      dataset_name: 'Mock Dataset',
      soil_property: 'mock-soil-property-id',
      property_acronym: 'MSP',
      standard_unit: 'g/kg',
      value: 42,
      geometry: null,
      license_name: 'Mock License',
      sampling_date: null,
      min_depth: null,
      max_depth: null,
      sample_pretreatment: null,
      technique: null,
      laboratory_method: null,
      extractant_concentration: null,
      extraction_ratio: null,
      extraction_base: null,
      measurement_procedure: null,
      limit_of_detection: null,
      cursor: 'mock-cursor',
    },
  ],
  isLoading: false,
  hasMore: true,
  loadMore: () => {},
  reset: () => {},
};

// Mirrors the other mocks above: a static value, no real persistence. saveConfig
// is a no-op since there's no host-backed /config endpoint in local preview.
const pluginConfig = <T>(defaultConfig?: T): PluginConfigResult<T> => ({
  config: defaultConfig,
  isLoading: false,
  isError: false,
  saveConfig: async () => {},
});

export const createMockContext = (overrides: Partial<PluginContext> = {}): PluginContext => ({
  user: { profile: { name: 'Local Preview User' } },
  mapSelection,
  useTheme: () => query(theme),
  useDataFilterQuery: () => query('mock-filter-id'),
  useFilteredCoverageQuery: () => query(filteredCoverage),
  useSoilProperties: () => query(soilProperties),
  usePropertiesCategories: () => query(propertiesCategories),
  useRasterCategories: () => query(rasterCategories),
  useSoilData: () => soilData,
  usePluginConfig: (_pluginId, _id, defaultConfig) => pluginConfig(defaultConfig),
  ...overrides,
});
