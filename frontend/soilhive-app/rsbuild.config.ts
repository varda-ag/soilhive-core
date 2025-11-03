import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
// import path from 'path';
import {dependencies} from "./package.json";

export default defineConfig({
  // resolve: {
  //   alias: {
  //     react: path.resolve('./node_modules/react'),
  //     'react-dom': path.resolve('./node_modules/react-dom')
  //   }
  // },
  server: {
    port: 3001
  },
  output: {
    cleanDistPath: true
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
          singleton: true,
          eager: true
        },
        'react-dom': {
          singleton: true,
          eager: true
        },
        'react-singleton-context': { singleton: true, eager: true },
      }
    })
  ],
});
