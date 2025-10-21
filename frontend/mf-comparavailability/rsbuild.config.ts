import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

export default defineConfig({
  server: {
    port: 3001
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
          singleton: true
        },
        'react-dom': {
          singleton: true
        }
      }
    })
  ],
});
