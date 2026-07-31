import type { PluginContext, PluginFilteredData, PluginMapSelection, PluginQueryResult, PluginTheme } from 'frontend-plugin-types';
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

const mockContext: PluginContext = {
  user: { profile: { name: 'Local Preview User' } },
  mapSelection: mockMapSelection,
  useTheme: useMockTheme,
  useDataFilterQuery: useMockDataFilterQuery,
  useFilteredCoverageQuery: useMockFilteredCoverageQuery,
};

const App = () => {
  return (
    <div className="content">
      <Page context={mockContext} />
    </div>
  );
};

export default App;
