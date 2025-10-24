import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

export default defineConfig({
  server: {
    port: 3001
  },
  html: {
    title: 'Soilhive'
  },
  plugins: [
    pluginReact(),
    pluginModuleFederation({
      name: 'soilhive-app',
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
