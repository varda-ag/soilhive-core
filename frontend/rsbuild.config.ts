import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSass } from '@rsbuild/plugin-sass';
import { pluginSvgr } from '@rsbuild/plugin-svgr';
import { normaliseBasePath } from './src/configuration/basePath';

// Only for the dev and preview servers: a build serves any APP_BASE_PATH (ADR 0084).
const devBasePath = normaliseBasePath(process.env.APP_BASE_PATH);
if (devBasePath === undefined) throw new Error(`APP_BASE_PATH "${process.env.APP_BASE_PATH}" is not usable, e.g. /app`);

const sharedAlias = {
  assets: './src/assets',
  components: './src/components',
  configuration: './src/configuration',
  hooks: './src/hooks',
  types: './src/types',
  styles: './src/styles',
  adapters: './src/adapters',
  utilities: './src/utilities',
};

export default defineConfig({
  server: {
    base: devBasePath || '/',
  },
  environments: {
    // Client-side (browser) build: React SPA + hydration entry
    web: {
      source: {
        entry: {
          index: './src/index.tsx',
        },
      },
      resolve: {
        alias: sharedAlias,
      },
      output: {
        target: 'web',
        // Chunks find their path from the script that loaded them, and CSS
        // url()s are relative, so one build serves any APP_BASE_PATH. The
        // server anchors index.html's asset URLs (ADR 0084).
        assetPrefix: 'auto',
        sourceMap: {
          // Emit public .map files so Lighthouse can map minified JS back to
          // source and developers can debug production builds.
          js: 'source-map',
        },
        distPath: {
          root: 'dist/client',
        },
        cleanDistPath: true,
      },
      html: {
        title: 'SoilHive',
        template: './src/template.html',
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
    },

    // Server-side (Node) build: Express server that renders React to HTML strings.
    // entry-server.tsx is imported by server/index.ts and bundled together.
    ssr: {
      source: {
        entry: {
          index: './server/index.ts',
        },
      },
      resolve: {
        alias: sharedAlias,
      },
      output: {
        target: 'node',
        // Output as .cjs so Node.js treats it as CommonJS regardless of the
        // package.json "type": "module" setting in the source tree.
        filename: {
          js: '[name].cjs',
        },
        distPath: {
          root: 'dist/server',
        },
        // Keep false so `node --watch` doesn't crash when the file is briefly
        // deleted at the start of each incremental rebuild.
        cleanDistPath: false,
        minify: false,
      },
    },
  },
  plugins: [pluginReact(), pluginSass(), pluginSvgr()],
});
