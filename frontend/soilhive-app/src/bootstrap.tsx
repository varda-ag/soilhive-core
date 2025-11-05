import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import {CountProvider} from './store.tsx'

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(
    <CountProvider>
    <React.StrictMode>
      <App />
    </React.StrictMode>
    </CountProvider>
  );
}