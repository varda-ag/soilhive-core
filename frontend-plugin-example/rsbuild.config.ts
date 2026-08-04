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
