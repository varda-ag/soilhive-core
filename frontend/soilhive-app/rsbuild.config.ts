import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

import {dependencies as deps} from "./package.json";

export default defineConfig({
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
      name: 'soilhiveapp',
      exposes: {
        "./store": "./src/store",
      },
      filename: 'remoteEntry.js',
      // remotes: {
      //   soilhiveapp: "soilhiveapp@http://localhost:3001/remoteEntry.js",
      // },
      shared: {
        //...deps,
        react: {
          singleton: true,
          eager: true,
          requiredVersion: deps["react"],
        },
        'react-dom': {
          singleton: true,
          eager: true,
          requiredVersion: deps["react-dom"],
        }
      }
    })
  ],
});
