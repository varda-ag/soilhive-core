import { createInstance, type ModuleFederationRuntimePlugin } from '@module-federation/enhanced/runtime';
import React from 'react';
import ReactDOM from 'react-dom';
import { PluginType, type NewTabPlugin, type Plugin, type RemotePlugin, type SinglePagePlugin } from '../types/plugins';

export const isSinglePageModule = (module: RemotePlugin): module is SinglePagePlugin =>
  module.type === PluginType.SINGLE_PAGE && !!module.route && !!module.Page;

export const isNewTabModule = (module: RemotePlugin): module is NewTabPlugin => module.type === PluginType.NEW_TAB && !!module.targetUrl;

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

// The MF host is a singleton: it is created once at module load with no
// remotes. Remotes are registered dynamically once their config is fetched
// (see loadRemotes), so this instance must never be recreated.
const mf = createInstance({
  name: 'mf_host',
  remotes: [],
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

const store = {};

/**
 * Register and load the given remotes, returning the resolved remote modules.
 * Failed remotes resolve to null and are filtered out.
 *
 * This was previously done at module-init time via top-level await; it now runs
 * on demand so the remotes config can be fetched from the configuration service
 * at runtime (see RemotesProvider).
 */
async function loadRemotes(configs: Plugin[]): Promise<RemotePlugin[]> {
  const enabled = configs.filter(remote => remote.enabled);
  if (enabled.length === 0) return [];

  mf.registerRemotes(enabled.map(({ url: name, url: entry }) => ({ name, entry })));

  // Suppress console.error and console.warn for the duration of remote loading.
  // The MF runtime logs failures via console.warn (through AsyncWaterfallHook's
  // processError → warn() → logger.warn → console.warn) before rethrowing them.
  // The fallbackPlugin above ensures a silent <div /> is used instead.
  const _origConsoleError = console.error;
  const _origConsoleWarn = console.warn;
  console.error = () => {};
  console.warn = () => {};
  const remoteModules = await Promise.all(enabled.map(remote => mf.loadRemote<RemotePlugin>(remote.url).catch(() => null)));
  console.error = _origConsoleError;
  console.warn = _origConsoleWarn;

  return remoteModules.filter((module): module is RemotePlugin => !!module);
}

export { mf, loadRemotes, store };
