import type { PluginContext } from 'frontend-plugin-types';
import './App.css';
import { Page } from './components/ProviderComponent';

// Standalone preview harness (outside the host): stands in for the
// PluginContext the real host builds in frontend/src/Routes.tsx. Since
// useDatasets is just a function, it can be stubbed here with no host,
// react-query, or MF wiring at all.
const mockContext: PluginContext = {
  user: { profile: { name: 'Local Preview User' } },
  useDatasets: () => ({
    data: [{ id: '1', slug: 'example-dataset', name: 'Example dataset', description: 'Preview-only mock data' }],
    isLoading: false,
    isError: false,
  }),
};

const App = () => {
  return (
    <div className="content">
      <Page context={mockContext} />
    </div>
  );
};

export default App;
