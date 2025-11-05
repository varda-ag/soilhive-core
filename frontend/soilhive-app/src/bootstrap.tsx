import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// import { CountProvider } from "./store";
import { store } from './utilities/moduleFederation';

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <store.CountProvider>
        <App />
      </store.CountProvider>
    </React.StrictMode>,
  );
}