import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '../styles/index.scss';
// With --with-map, Map/'s translations resolve for free once embedded in the host (see "Using
// the map" in docs/frontend/plugin-development.md) — standalone dev preview shows raw keys for
// Map/'s own text (e.g. "dai_widget.title"), which is expected. For this plugin's own
// translations, see App.tsx (i18n.dev.ts) and ProviderComponent.tsx (registerResourceBundle).

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
