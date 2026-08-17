import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '../styles/index.scss';
// With --with-map, Map/'s translations resolve for free once embedded in the host (see "Using
// the map" in docs/frontend/plugin-development.md) — but need their own i18next init here first
// for standalone dev preview (`pnpm dev`), same as `frontend/src/utilities/i18n.ts` does for the
// host, or Map/'s strings render as raw keys (e.g. "dai_widget.title").

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
