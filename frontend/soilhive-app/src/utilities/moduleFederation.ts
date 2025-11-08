import { createInstance } from "@module-federation/enhanced/runtime";
import React from "react";
import ReactDOM from "react-dom";

const modulesListResponse = await fetch("http://localhost:3000/modules.json");
const modulesList = await modulesListResponse.json();
const remotes: any[] = modulesList;

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
const remoteModules: any[] = await Promise.all(remotes.map((remote) => mf.loadRemote(`${remote.name}/module`)));

const singlePages = remoteModules.filter((module) => module.type === "single-page");

const store = {};

export { remoteModules as modules, singlePages, store };
