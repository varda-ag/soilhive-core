import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSass } from '@rsbuild/plugin-sass';
import { pluginSvgr } from '@rsbuild/plugin-svgr';

export default defineConfig({
  server: {
    port: 3000,
  },
  output: {
    cleanDistPath: true,
  },
  html: {
    title: 'SoilHive',
    tags: [
      {
        tag: 'script',
        attrs: {
          src: '/env-config.js',
        },
        head: true,
        append: true,
      },
    ],
  },
  resolve: {
    alias: {
      assets: './src/assets',
      components: './src/components',
      hooks: './src/hooks',
      types: './src/types',
      styles: './src/styles',
      adapters: './src/adapters'
    },
  },
  plugins: [pluginReact(), pluginSass(), pluginSvgr()],
});
