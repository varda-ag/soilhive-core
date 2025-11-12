import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSass } from '@rsbuild/plugin-sass';
import { pluginSvgr } from '@rsbuild/plugin-svgr';

export default defineConfig({
  server: {
    port: 3000
  },
  output: {
    cleanDistPath: true
  },
  html: {
    title: 'Soilhive'
  },
  plugins: [
    pluginReact(),
    pluginSass(),
    pluginSvgr()
  ],
});
