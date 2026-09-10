import './App.css';
import './i18n.dev';
import { Page } from './components/ProviderComponent';
import { createMockContext } from './mockContext';

const App = () => {
  return (
    <div className="content">
      <Page context={createMockContext()} />
    </div>
  );
};

export default App;
