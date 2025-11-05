import React from 'react';
import { createRoot } from 'react-dom/client';
import InternalPage from './InternalPage';

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <InternalPage />
    </React.StrictMode>,
  );
}