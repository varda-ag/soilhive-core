import { createInstance, type ModuleFederationRuntimePlugin } from '@module-federation/enhanced/runtime';
import React from 'react';
import ReactDOM from 'react-dom';
import i18next from 'i18next';
import * as ReactI18next from 'react-i18next';
import * as ReactRouter from 'react-router';
import {
  PluginType,
  type MapInfoCardPlugin,
  type NewTabPlugin,
  type Plugin,
  type RemotePlugin,
  type SinglePagePlugin,
} from '../types/plugins';

export const isSinglePageModule = (module: RemotePlugin): module is SinglePagePlugin =>
  module.type === PluginType.SINGLE_PAGE && !!module.route && !!module.Page;

export const isNewTabModule = (module: RemotePlugin): module is NewTabPlugin => module.type === PluginType.NEW_TAB && !!module.targetUrl;

const isMapInfoCardModule = (module: RemotePlugin | null): module is MapInfoCardPlugin =>
  module?.type === PluginType.MAP_INFO_CARD && !!module.Page;

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
// thrown as an error: remotes are loaded before the router exists, outside the plugin
// routes' errorElement, so a throw here would surface as a blank page instead of the
// notification the caller (RemotesContext) shows the user.
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

// Populated by fallbackPlugin's errorLoadRemote below, keyed by the `id` passed to
// mf.loadRemote: a remote url, or `${url}/mapInfoCard` for a card, whose expose may
// be missing. loadRemoteModule removes the id again. Lets loadRemotes tell "remote failed to
// load" apart from "remote loaded but its module content is invalid": the MF
// runtime resolves loadRemote() successfully with the fallback object below
// rather than rejecting, so the failure would otherwise be indistinguishable
// from a real (if malformed) loaded module.
const failedRemoteUrls = new Set<string>();

// Custom fallback plugin implementing errorLoadRemote hook
const fallbackPlugin = (): ModuleFederationRuntimePlugin => {
  return {
    name: 'fallback-plugin',
    async errorLoadRemote(args) {
      // Silently handle all remote loading failures so that unavailable
      // remotes (e.g. localhost:3333 not running in local dev) produce no
      // console output. The onLoad fallback prevents the app from crashing.
      if (args.lifecycle === 'onLoad') {
        failedRemoteUrls.add(args.id);
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
  // A plugin that mounts its own nested <Routes> (e.g. the dashboards plugin's PluginRoutes)
  // calls useRoutes() internally, which reads React context (NavigationContext) off its own
  // bundled react-router module. Since this app never wraps a plugin's Page in a Router of its
  // own anymore (the host's own RouterProvider supplies that context — see Routes.tsx), the
  // plugin's react-router must resolve to this exact same module instance, or its useRoutes()
  // call finds no matching context and throws "useRoutes() may be used only in the context of a
  // <Router> component." Each plugin declares 'react-router': { singleton: true } as shared
  // (see e.g. soilhive-plugins/dashboards/module-federation.config.ts) expecting the host to
  // provide it, same as react/react-dom/i18next/react-i18next above.
  'react-router': {
    version: '7.18.4',
    scope: 'default',
    lib: () => ReactRouter,
    shareConfig: {
      singleton: true,
      requiredVersion: '7.18.4',
    },
  },
});

const store = {};

// Counted so overlapping loadRemotes calls restore the real console only when the last one ends;
// a per-call save/restore lets the second call save the first one's no-ops and keep them for good.
let consoleMuteCount = 0;
let mutedConsole: Pick<Console, 'error' | 'warn'> | undefined;

function muteConsole() {
  if (consoleMuteCount++ === 0) {
    mutedConsole = { error: console.error, warn: console.warn };
    console.error = () => {};
    console.warn = () => {};
  }
}

function unmuteConsole() {
  if (--consoleMuteCount === 0 && mutedConsole) {
    console.error = mutedConsole.error;
    console.warn = mutedConsole.warn;
    mutedConsole = undefined;
  }
}

// A relative remote url is relative to the host page, as the MF runtime reads it
const toAbsoluteUrl = (url: string): string | undefined => {
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return undefined;
  }
};

const MAP_INFO_CARD_EXPOSE = 'mapInfoCard';

// A remote that failed to load still resolves (to fallbackPlugin's placeholder object above)
// rather than rejecting, so a failure is only detectable via failedRemoteUrls.
async function loadRemoteModule(id: string): Promise<RemotePlugin | null> {
  const module = await mf.loadRemote<RemotePlugin>(id).catch(() => null);
  return failedRemoteUrls.delete(id) ? null : module;
}

/**
 * Register and load the given remotes, returning the modules that loaded
 * successfully and the urls of the ones that didn't. A page module that sets
 * hasMapInfoCard declares a './mapInfoCard' expose: its Page is attached to the
 * plugin as MapInfoCard. A declared card that fails to load, or is not a
 * map-info-card module with a Page, leaves the plugin without a card and its url
 * in failedCards.
 *
 * This was previously done at module-init time via top-level await; it now runs
 * on demand so the remotes config can be fetched from the configuration service
 * at runtime (see RemotesProvider).
 */
async function loadRemotes(configs: Plugin[]): Promise<{ loaded: RemotePlugin[]; failed: string[]; failedCards: string[] }> {
  const enabled = configs.filter(remote => remote.enabled);
  if (enabled.length === 0) return { loaded: [], failed: [], failedCards: [] };

  mf.registerRemotes(enabled.map(({ url: name, url: entry }) => ({ name, entry })));

  // Suppress console.error and console.warn for the duration of remote loading.
  // The MF runtime logs failures via console.warn (through AsyncWaterfallHook's
  // processError → warn() → logger.warn → console.warn) before rethrowing them.
  // The fallbackPlugin above ensures a silent <div /> is used instead.
  muteConsole();
  let remoteModules: (RemotePlugin | null)[];
  let cardModules: (RemotePlugin | null)[];
  try {
    remoteModules = await Promise.all(enabled.map(remote => loadRemoteModule(remote.url)));
    // MF resolves `${url}/mapInfoCard` to the remote registered under url, by string prefix.
    cardModules = await Promise.all(
      enabled.map((remote, index) =>
        remoteModules[index]?.hasMapInfoCard ? loadRemoteModule(`${remote.url}/${MAP_INFO_CARD_EXPOSE}`) : null,
      ),
    );
  } finally {
    unmuteConsole();
  }

  const loaded: RemotePlugin[] = [];
  const failed: string[] = [];
  const failedCards: string[] = [];
  remoteModules.forEach((module, index) => {
    const { url } = enabled[index];
    if (!module) {
      failed.push(url);
      return;
    }
    const card = cardModules[index];
    if (module.hasMapInfoCard && !isMapInfoCardModule(card)) failedCards.push(url);
    // Copied rather than mutated: a loaded module is an ES module namespace,
    // which is not extensible. Any truthy value gates, so a malformed flag
    // fails closed. remoteUrl and MapInfoCard come last so a module can't supply its own.
    loaded.push({
      ...module,
      requiresAuth: !!module.requiresAuth || !!enabled[index].mustBeLoggedIn,
      remoteUrl: toAbsoluteUrl(url),
      MapInfoCard: isMapInfoCardModule(card) ? card.Page : undefined,
    });
  });

  return { loaded, failed, failedCards };
}

export { mf, loadRemotes, store };
