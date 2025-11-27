import { defineConfig } from '@rstest/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSass } from '@rsbuild/plugin-sass';
import { pluginSvgr } from '@rsbuild/plugin-svgr';

export default defineConfig({
  testEnvironment: 'jsdom',
  globals: true,
  setupFiles: ['./rstest.setup.ts'],
  output: {
    cssModules: {
      auto: true,
      localIdentName: '[local]',
    },
  },
  resolve: {
    alias: {
      assets: './src/assets',
      components: './src/components',
      types: './src/types'
    },
  },
  coverage: {
    enabled: true,
    include: ['src/**/*.{js,jsx,ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
  plugins: [
    pluginReact(),
    pluginSass(),
    pluginSvgr()
  ],
});