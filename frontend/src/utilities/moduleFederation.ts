import { createInstance, type ModuleFederationRuntimePlugin } from '@module-federation/enhanced/runtime';
import React from 'react';
import ReactDOM from 'react-dom';
import i18next from 'i18next';
import * as ReactI18next from 'react-i18next';
import { PluginType, type NewTabPlugin, type Plugin, type RemotePlugin, type SinglePagePlugin } from '../types/plugins';

export const isSinglePageModule = (module: RemotePlugin): module is SinglePagePlugin =>
  module.type === PluginType.SINGLE_PAGE && !!module.route && !!module.Page;

export const isNewTabModule = (module: RemotePlugin): module is NewTabPlugin => module.type === PluginType.NEW_TAB && !!module.targetUrl;

const REQUIRED_FIELDS_BY_TYPE: Record<PluginType, (keyof RemotePlugin)[]> = {
  [PluginType.SINGLE_PAGE]: ['route', 'Page'],
  [PluginType.NEW_TAB]: ['targetUrl'],
  [PluginType.MAP_INFO_CARD]: ['Page'],
};

function getMissingRequiredFields(module: RemotePlugin): string[] {
  const missing: string[] = (['pluginId', 'name'] as const).filter(field => !module[field]);
  const typeFields = module.type ? REQUIRED_FIELDS_BY_TYPE[module.type] : undefined;
  if (!typeFields) {
    missing.push('type');
  } else {
    missing.push(...typeFields.filter(field => !module[field]));
  }
  return missing;
}

// Splits out modules missing pluginId, name, type, or a type-specific required
// field (e.g. route for a single-page plugin). Reported via notification rather
// than thrown, same reasoning as partitionDuplicatePluginIds below. Must run
// before partitionDuplicatePluginIds, since that function keys a Set on
// module.pluginId and a missing pluginId would corrupt the dedup.
export function partitionInvalidPlugins(modules: RemotePlugin[]): {
  valid: RemotePlugin[];
  invalid: { module: RemotePlugin; missingFields: string[] }[];
} {
  const valid: RemotePlugin[] = [];
  const invalid: { module: RemotePlugin; missingFields: string[] }[] = [];
  for (const module of modules) {
    const missingFields = getMissingRequiredFields(module);
    if (missingFields.length === 0) {
      valid.push(module);
    } else {
      invalid.push({ module, missingFields });
    }
  }
  return { valid, invalid };
}

// Splits out modules whose pluginId collides with an earlier one. The first-seen
// plugin for a given id wins and the rest are reported as duplicates rather than
// thrown as an error: there's no ErrorBoundary mounted anywhere in the app, so a
// throw here would surface as a blank page instead of the notification the caller
// (RemotesContext) shows the user.
export function partitionDuplicatePluginIds(modules: RemotePlugin[]): { unique: RemotePlugin[]; duplicates: RemotePlugin[] } {
  const seen = new Set<string>();
  const unique: RemotePlugin[] = [];
  const duplicates: RemotePlugin[] = [];
  for (const module of modules) {
    if (seen.has(module.pluginId)) {
      duplicates.push(module);
    } else {
      seen.add(module.pluginId);
      unique.push(module);
    }
  }
  return { unique, duplicates };
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
  // Shared so a --with-map plugin's vendored Map/ files (DaiWidget, GeocoderControl,
  // SoilhiveMapToolbar, SoilhiveMapSelectionToolbar, SoilhiveMap itself — all call
  // useTranslation('availability')) resolve against this app's own already-initialized i18next
  // instance instead of bundling and initializing a disconnected copy of their own. Both packages
  // must be shared, not just i18next: react-i18next's useTranslation reads a module-scoped
  // instance reference set by initReactI18next's init hook (see frontend/src/utilities/i18n.ts) —
  // if react-i18next itself weren't deduped too, a plugin's separately-bundled copy would have its
  // own unset reference, even with the same underlying i18next instance shared.
  i18next: {
    version: '25.8.13',
    scope: 'default',
    lib: () => i18next,
    shareConfig: {
      singleton: true,
      requiredVersion: '25.8.13',
    },
  },
  'react-i18next': {
    version: '16.5.4',
    scope: 'default',
    lib: () => ReactI18next,
    shareConfig: {
      singleton: true,
      requiredVersion: '16.5.4',
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
