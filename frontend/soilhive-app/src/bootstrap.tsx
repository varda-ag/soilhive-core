import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

import './styles/index.scss';

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(
    <Suspense fallback="">
      <React.StrictMode>
        <App />
      </React.StrictMode>
    </Suspense>,
  );
}
