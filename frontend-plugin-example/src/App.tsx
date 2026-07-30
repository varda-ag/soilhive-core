import type { PluginContext, PluginDataset, PluginQueryResult } from 'frontend-plugin-types';
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

const mockContext: PluginContext = {
  user: { profile: { name: 'Local Preview User' } },
  useDatasets: useMockDatasets,
};

const App = () => {
  return (
    <div className="content">
      <Page context={mockContext} />
    </div>
  );
};

export default App;
