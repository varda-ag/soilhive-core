import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSass } from '@rsbuild/plugin-sass';
import { pluginSvgr } from '@rsbuild/plugin-svgr';

const sharedAlias = {
  assets: './src/assets',
  components: './src/components',
  hooks: './src/hooks',
  types: './src/types',
  styles: './src/styles',
  adapters: './src/adapters',
};

export default defineConfig({
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
        // Externalize all node_modules — they are available at runtime and
        // bundling them causes errors with dynamic requires (e.g. express/lib/view.js).
        externals: [/^[^./!]/],
      },
    },
  },
  plugins: [pluginReact(), pluginSass(), pluginSvgr()],
});
