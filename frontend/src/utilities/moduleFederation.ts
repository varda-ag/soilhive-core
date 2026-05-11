import { createInstance, type ModuleFederationRuntimePlugin } from '@module-federation/enhanced/runtime';
import React from 'react';
import ReactDOM from 'react-dom';

interface RemoteConfig {
  name: string;
  entry: string; // mf-manifest.json url for the module
}

// Custom fallback plugin implementing errorLoadRemote hook
const fallbackPlugin = (): ModuleFederationRuntimePlugin => {
  return {
    name: 'fallback-plugin',
    async errorLoadRemote(args) {
      // Silently handle all remote loading failures so that unavailable
      // remotes (e.g. localhost:3333 not running in local dev) produce no
      // console output. The onLoad fallback prevents the app from crashing.
      if (args.lifecycle === 'onLoad') {
        return {
          fallback: '<div />',
        };
      }
      // For other lifecycle stages (e.g. afterResolve), return undefined so
      // the MF runtime proceeds to onLoad where the fallback above is served.
    },
  };
};

// Stub function - will fetch from configuration service later
async function loadRemotesConfig(): Promise<RemoteConfig[]> {
  return [
    {
      name: 'module_example',
      entry: 'http://localhost:3333/mf-manifest.json',
    },
  ];
}

const remotes = await loadRemotesConfig();

const mf = createInstance({
  name: 'mf_host',
  remotes,
  plugins: [fallbackPlugin()],
});

mf.registerShared({
  react: {
    version: '19.2.0',
    scope: 'default',
    lib: () => React,
    shareConfig: {
      singleton: true,
      requiredVersion: '19.2.0',
    },
  },
  'react-dom': {
    version: '19.2.0',
    scope: 'default',
    lib: () => ReactDOM,
    shareConfig: {
      singleton: true,
      requiredVersion: '19.2.0',
    },
  },
});

// Suppress console.error and console.warn for the duration of remote loading.
// The MF runtime logs failures via console.warn (through AsyncWaterfallHook's
// processError → warn() → logger.warn → console.warn) before rethrowing them.
// The fallbackPlugin above ensures a silent <div /> is used instead.
const _origConsoleError = console.error;
const _origConsoleWarn = console.warn;
console.error = () => {};
console.warn = () => {};
// Top level await, the module pauses until it resolves the promise and then it does the export
const remoteModules: any[] = await Promise.all(remotes.map(remote => mf.loadRemote(remote.name).catch(() => null)));
console.error = _origConsoleError;
console.warn = _origConsoleWarn;

const singlePages = remoteModules.filter(module => module && module.type === 'single-page');

const store = {};

export { remoteModules as modules, singlePages, store };
