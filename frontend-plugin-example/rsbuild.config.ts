import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import moduleFederationConfig from './module-federation.config';

export default defineConfig({
  plugins: [pluginReact(), pluginModuleFederation(moduleFederationConfig)],
  resolve: {
    alias: {
      // Force any package (e.g. the symlinked frontend-hooks) to resolve react/react-dom
      // to this app's own copy, rather than one pnpm may install alongside that package.
      react: './node_modules/react',
      'react-dom': './node_modules/react-dom',
    },
  },
  server: {
    port: 3333,
  },
});
