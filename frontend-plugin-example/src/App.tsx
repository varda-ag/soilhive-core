import type {
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
import './App.css';
import { Page } from './components/ProviderComponent';

const mockMapSelection: PluginMapSelection = {
  selectedPoint: { lng: -122.4194, lat: 37.7749 },
  selectedH3Cell: null,
  selection: { type: 'FeatureCollection', features: [] },
  boundingBox: [-122.5, 37.7, -122.35, 37.85],
  geometryFilter: [],
  selectionType: 'drawn-polygon',
  locationName: 'Local Preview Area',
};

const useMockTheme = (): PluginQueryResult<PluginTheme> => ({
  data: { colors: { primary: '#2f6f4f', background: '#ffffff' }, logoUrl: null },
  isLoading: false,
  isError: false,
});

const useMockDataFilterQuery = (): PluginQueryResult<string> => ({
  data: 'mock-filter-id',
  isLoading: false,
  isError: false,
});

const useMockFilteredCoverageQuery = (): PluginQueryResult<PluginFilteredData> => ({
  data: {
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
  },
  isLoading: false,
  isError: false,
});

const useMockSoilProperties = (): PluginQueryResult<PluginSoilProperty[]> => ({
  data: [
    {
      id: 'mock-soil-property-id',
      property_name: 'Mock Soil Property',
      property_acronym: 'MSP',
      category_id: 'mock-category-id',
      original_units_of_measurement: {},
    },
  ],
  isLoading: false,
  isError: false,
});

const useMockPropertiesCategories = (): PluginQueryResult<PluginSoilPropertyCategory[]> => ({
  data: [
    {
      id: 'mock-category-id',
      slug: 'mock-category',
      category_name: 'Mock Category',
      category_acronym: 'MC',
    },
  ],
  isLoading: false,
  isError: false,
});

const useMockRasterCategories = (): PluginQueryResult<PluginRasterFilterCategory[]> => ({
  data: [
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
  ],
  isLoading: false,
  isError: false,
});

const useMockSoilData = (): PluginSoilDataResult => ({
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
  hasMore: false,
  loadMore: () => {},
  reset: () => {},
});

const mockContext: PluginContext = {
  user: { profile: { name: 'Local Preview User' } },
  mapSelection: mockMapSelection,
  useTheme: useMockTheme,
  useDataFilterQuery: useMockDataFilterQuery,
  useFilteredCoverageQuery: useMockFilteredCoverageQuery,
  useSoilProperties: useMockSoilProperties,
  usePropertiesCategories: useMockPropertiesCategories,
  useRasterCategories: useMockRasterCategories,
  useSoilData: useMockSoilData,
};

const App = () => {
  return (
    <div className="content">
      <Page context={mockContext} />
    </div>
  );
};

export default App;
