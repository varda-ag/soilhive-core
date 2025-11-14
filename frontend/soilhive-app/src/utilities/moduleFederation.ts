import { createInstance } from "@module-federation/enhanced/runtime";
import React from "react";
import ReactDOM from "react-dom";
import { REMOTE_MODULE_URL } from "./environmentVariables";

interface RemoteConfig {
  name: string;
  entry: string; // mf-manifest.json url for the module
}

// Stub function - will fetch from configuration service later
async function loadRemotesConfig(): Promise<RemoteConfig[]> {
  if (REMOTE_MODULE_URL) {
    console.log("Remote module:", REMOTE_MODULE_URL);
    return [
      {
        name: "module_example",
        entry: REMOTE_MODULE_URL,
      },
    ];
  }
  return [];
}

const remotes = await loadRemotesConfig();

const mf = createInstance({
  name: "mf_host",
  remotes,
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
