import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { pluginModuleFederation } from "@module-federation/rsbuild-plugin";

export default defineConfig({
  server: {
    port: 3002,
  },
  output: {
    cleanDistPath: true,
  },
  html: {
    title: "mf-comparavailability",
  },
  plugins: [
    pluginReact(),
    pluginModuleFederation({
      name: "comparavailability",
      exposes: {
        "./module": "./src/module",
      },
      filename: "remoteEntry.js",
      shared: {
        react: { singleton: true },
        "react-dom": { singleton: true },
      },
    }),
  ],
});
