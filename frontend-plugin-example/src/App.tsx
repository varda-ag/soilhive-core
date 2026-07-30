import type { PluginContext, PluginDataset, PluginMapSelection, PluginQueryResult, PluginTheme } from 'frontend-plugin-types';
import './App.css';
import { Page } from './components/ProviderComponent';

const mockDatasets: PluginDataset[] = [
  { id: '1', slug: 'mock-dataset-1', name: 'Mock Dataset 1', description: 'A local preview dataset' },
  { id: '2', slug: 'mock-dataset-2', name: 'Mock Dataset 2' },
];

const useMockDatasets = (): PluginQueryResult<PluginDataset[]> => ({
  data: mockDatasets,
  isLoading: false,
  isError: false,
});

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

const mockContext: PluginContext = {
  user: { profile: { name: 'Local Preview User' } },
  useDatasets: useMockDatasets,
  mapSelection: mockMapSelection,
  useTheme: useMockTheme,
};

const App = () => {
  return (
    <div className="content">
      <Page context={mockContext} />
    </div>
  );
};

export default App;
