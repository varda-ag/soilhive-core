import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

export default defineConfig({
  server: {
    port: 3002
  },
  output: {
    cleanDistPath: true
  },
  plugins: [
    pluginReact(),
    pluginModuleFederation({
      name: 'comparavailability',
      exposes: {
        './module': './src/module'
      },
      filename: 'remoteEntry.js',
      shared: {
        react: {
          singleton: true,
          eager: true
        },
        'react-dom': {
          singleton: true,
          eager: true
        },
        "./src/components/Map.tsx": {}
      }
    })
  ],
});
