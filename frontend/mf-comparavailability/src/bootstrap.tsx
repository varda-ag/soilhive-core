import React from 'react';
import { createRoot } from 'react-dom/client';
import Page from './Page';

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <Page />
    </React.StrictMode>,
  );
}