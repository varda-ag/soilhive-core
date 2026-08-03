import './App.css';
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
