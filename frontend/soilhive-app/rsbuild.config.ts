import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

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
  ],
});
