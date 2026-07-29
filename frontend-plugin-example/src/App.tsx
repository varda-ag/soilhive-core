import type { PluginContext } from 'frontend-plugin-types';
import './App.css';
import { Page } from './components/ProviderComponent';

const mockContext: PluginContext = {
  user: { profile: { name: 'Local Preview User' } },
};

const App = () => {
  return (
    <div className="content">
      <Page context={mockContext} />
    </div>
  );
};

export default App;
