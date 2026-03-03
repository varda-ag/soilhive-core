import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

import './styles/index.scss';
// import { CountProvider } from "./store";
// import { store } from './utilities/moduleFederation';

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(
    <Suspense fallback="...is loading">
      <React.StrictMode>
        <App />
      </React.StrictMode>
    </Suspense>,
  );
}
