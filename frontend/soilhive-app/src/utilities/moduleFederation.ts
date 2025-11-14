import { createInstance, type ModuleFederationRuntimePlugin } from "@module-federation/enhanced/runtime";
import React from "react";
import ReactDOM from "react-dom";

interface RemoteConfig {
  name: string;
  entry: string; // mf-manifest.json url for the module
}

// Custom fallback plugin implementing errorLoadRemote hook
const fallbackPlugin = (): ModuleFederationRuntimePlugin => {
  return {
    name: "fallback-plugin",
    async errorLoadRemote(args) {
      const { lifecycle, error, id } = args;
      console.error(`Failed to load remote ${id} at lifecycle stage: ${lifecycle}`, error);
      if (lifecycle === "onLoad") {
        return {
          // Returning a fallback React component for error boundary rendering
          fallback: "<div />",
        };
      }
      return;
    },
  };
};

// Stub function - will fetch from configuration service later
async function loadRemotesConfig(): Promise<RemoteConfig[]> {
  return [
    {
      name: "module_example",
      entry: "http://localhost:3333/mf-manifest.json",
    },
  ];
}

const remotes = await loadRemotesConfig();

const mf = createInstance({
  name: "mf_host",
  remotes,
  plugins: [fallbackPlugin()],
});

mf.registerShared({
  react: {
    version: "19.2.0",
    scope: "default",
    lib: () => React,
    shareConfig: {
      singleton: true,
      requiredVersion: "19.2.0",
    },
  },
  "react-dom": {
    version: "19.2.0",
    scope: "default",
    lib: () => ReactDOM,
    shareConfig: {
      singleton: true,
      requiredVersion: "19.2.0",
    },
  },
});

// Top level await, the module pauses until it resolves the promise and then it does the export
const remoteModules: any[] = await Promise.all(
  remotes.map((remote) => {
    try {
      return mf.loadRemote(remote.name);
    } catch (error) {
      console.error(`Error loading remote ${remote.name}:`, error);
      return null;
    }
  })
);

const singlePages = remoteModules.filter((module) => module && module.type === "single-page");

const store = {};

export { remoteModules as modules, singlePages, store };
