import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSass } from '@rsbuild/plugin-sass';
import { pluginSvgr } from '@rsbuild/plugin-svgr';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import moduleFederationConfig from './module-federation.config';

export default defineConfig({
  // pluginSvgr is required by the synced UI/ components: many of them import icons as
  // `*.svg?react`. The `styles` alias mirrors the host's, so UI/ SCSS that imports design
  // tokens as `styles/variables/...` resolves against this plugin's own styles/ directory.
  //
  // Map/'s cross-cutting files (hooks/, utilities/, types/, configuration/, assets/icons/) live
  // nested under Map/_shared/, not at the plugin root — `syncMap` rewrites all of Map/'s own
  // references to relative Map/_shared/ paths at sync time, so no matching alias is needed here.
  // This means retrofitting --with-map onto an existing plugin never needs to touch this
  // dev-owned file at all, for any of Map/'s dependencies.
  plugins: [pluginReact(), pluginSass(), pluginSvgr(), pluginModuleFederation(moduleFederationConfig)],
  resolve: {
    alias: {
      styles: './styles',
    },
  },
  server: {
    port: 3333,
  },
});
