import { createModuleFederationConfig } from '@module-federation/rsbuild-plugin';

export default createModuleFederationConfig({
  name: 'module_example',
  exposes: {
    '.': './src/components/ProviderComponent.tsx',
  },
  shared: {
    react: { singleton: true },
    'react-dom': { singleton: true },
    // Added unconditionally, like react/react-dom above — not just for plugins that use
    // --with-map. module-federation.config.ts is copy-once-then-dev-owned, so declaring this
    // upfront means retrofitting --with-map onto an existing plugin never needs to touch it: when
    // embedded in the host, Map/'s translations resolve against the host's own already-initialized
    // i18next instance for free. Harmless if unused — nothing is shared unless something actually
    // imports these packages. See frontend/src/utilities/moduleFederation.ts for the host side.
    i18next: { singleton: true },
    'react-i18next': { singleton: true },
  },
});
