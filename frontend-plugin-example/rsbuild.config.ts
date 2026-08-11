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
  // assets/hooks/types/utilities/configuration mirror the host's own aliases too, unconditionally
  // — not just for plugins that opt into --with-map. Since rsbuild.config.ts is dev-owned after
  // the first scaffold (ADR 0024), adding these upfront means retrofitting --with-map onto an
  // existing plugin later never needs to touch this file: the aliases are already there, `syncMap`
  // just has to drop files into the folders they point at.
  plugins: [pluginReact(), pluginSass(), pluginSvgr(), pluginModuleFederation(moduleFederationConfig)],
  resolve: {
    alias: {
      styles: './styles',
      assets: './assets',
      hooks: './hooks',
      types: './types',
      utilities: './utilities',
      configuration: './configuration',
    },
  },
  server: {
    port: 3333,
  },
});
