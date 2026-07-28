import React, { useContext } from 'react';
import { loadShareSync } from '@module-federation/enhanced/runtime';
import './ProviderComponent.css';

// Spike (sp-5483): minimal shape this plugin expects from the host's real
// ThemeContext. Nothing enforces this matches the host's actual
// ThemeContextType (frontend/src/contexts/ThemeContext.tsx) - there's no
// shared types package here, so this "contract" exists only because the
// plugin author read the host's source. Two ways to reference the host's
// real type directly were tried and both fail: a relative `import type`
// into frontend/src/contexts/ThemeContext.tsx, and a `declare module`
// re-export of it - both end up needing frontend's own path aliases
// (hooks/*, types/*, components/*, assets/*.svg?react) that only exist in
// frontend's own tsconfig. See docs/frontend/plugin-context-mf-shared.md.
type HostThemeContextValue = {
  themeConfig: { colors: Record<string, string> };
};

// Assumes this module only ever runs as an MF remote loaded by the host
// (never standalone), so 'theme-context' is always present in the shared
// scope by the time this module evaluates.
const getThemeContext = loadShareSync<React.Context<HostThemeContextValue | undefined>>('theme-context', {
  customShareInfo: { shareConfig: { singleton: true, requiredVersion: false } },
});
const ThemeContext = getThemeContext();

const Page: React.FC = () => {
  const theme = useContext(ThemeContext);
  const colors = theme?.themeConfig.colors;

  return (
    <div className="container">
      <div className="icon-container">
        <img src="https://module-federation.io/svg.svg" alt="logo" className="logo-image" />
      </div>
      <h1 className="title">Hello Module Federation 2.0</h1>
      {colors && (
        <div className="theme-swatches">
          {Object.entries(colors).map(([key, value]) => (
            <div key={key} className="theme-swatch" style={{ backgroundColor: value }} title={value}>
              {key}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const name = '★ Name of remote module ★';
const type = 'single-page';
const route = 'remote-module';
export { name, route, type, Page };
