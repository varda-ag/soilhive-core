import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { CountProvider } from "./store";

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <CountProvider>
        <App />
      </CountProvider>
    </React.StrictMode>,
  );
}