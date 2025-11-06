import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { pluginModuleFederation } from "@module-federation/rsbuild-plugin";

import { dependencies as deps } from "./package.json";

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
    //pluginReact(),
    pluginModuleFederation({
      name: "comparavailability",
      exposes: {
        "./module": "./src/module",
      },
      filename: "remoteEntry.js",
      // remotes: {
      //   soilhiveapp: "soilhiveapp@http://localhost:3001/remoteEntry.js",
      // },
      shared: {
        //...deps,
        // react: {
        //   singleton: true,
        //   eager: true,
        //   requiredVersion: "19.2.0",
        // },
        // 'react-dom': {
        //   singleton: true,
        //   eager: true,
        //   requiredVersion: "19.2.0",
        // }
      },
    }),
  ],
});
