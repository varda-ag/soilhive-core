// Stub the MF runtime so importing moduleFederation.ts doesn't spin up the real
// host at module load; these tests only exercise the pure plugin type guards.
const loadRemote = jest.fn();
jest.mock('@module-federation/enhanced/runtime', () => ({
  createInstance: jest.fn((options: { plugins: unknown[] }) => ({
    plugins: options.plugins,
    registerShared: jest.fn(),
    registerRemotes: jest.fn(),
    loadRemote,
  })),
}));

import {
  isNewTabModule,
  pairMapInfoCards,
  partitionInvalidMapInfoCards,
  isSinglePageModule,
  loadRemotes,
  partitionDuplicatePluginIds,
  partitionInvalidPlugins,
  mf,
} from 'utilities/moduleFederation';
import { PluginType, type MapInfoCardPlugin, type Plugin, type RemotePlugin } from '../../src/types/plugins';

// The MF runtime calls this hook for a remote or expose that fails to load (see fallbackPlugin).
const fallbackPlugin = (mf as unknown as { plugins: { errorLoadRemote: (args: { id: string; lifecycle: string }) => Promise<unknown> }[] })
  .plugins[0];

const Page = () => null;

const singlePage: RemotePlugin = { pluginId: 'single', type: PluginType.SINGLE_PAGE, name: 'single', route: '/single', Page };
const newTab: RemotePlugin = { pluginId: 'tab', type: PluginType.NEW_TAB, name: 'tab', targetUrl: 'https://example.com' };
const mapInfoCard: RemotePlugin = { pluginId: 'card', type: PluginType.MAP_INFO_CARD, name: 'card', Page };

describe('isSinglePageModule', () => {
  it('accepts a single-page plugin with a route and a Page', () => {
    expect(isSinglePageModule(singlePage)).toBe(true);
  });

  it('rejects other plugin types', () => {
    expect(isSinglePageModule(newTab)).toBe(false);
    expect(isSinglePageModule(mapInfoCard)).toBe(false);
  });

  it('rejects a single-page plugin missing a route or a Page', () => {
    expect(isSinglePageModule({ pluginId: 'no-route', type: PluginType.SINGLE_PAGE, name: 'no-route', Page })).toBe(false);
    expect(isSinglePageModule({ pluginId: 'no-page', type: PluginType.SINGLE_PAGE, name: 'no-page', route: '/x' })).toBe(false);
  });
});

describe('isNewTabModule', () => {
  it('accepts a new-tab plugin with a targetUrl', () => {
    expect(isNewTabModule(newTab)).toBe(true);
  });

  it('rejects other plugin types', () => {
    expect(isNewTabModule(singlePage)).toBe(false);
    expect(isNewTabModule(mapInfoCard)).toBe(false);
  });

  it('rejects a new-tab plugin missing a targetUrl', () => {
    expect(isNewTabModule({ pluginId: 'no-url', type: PluginType.NEW_TAB, name: 'no-url' })).toBe(false);
  });
});

describe('partitionInvalidPlugins', () => {
  it('treats a well-formed plugin of each type as valid', () => {
    expect(partitionInvalidPlugins([singlePage, newTab, mapInfoCard])).toEqual({
      valid: [singlePage, newTab, mapInfoCard],
      invalid: [],
    });
  });

  it('flags a plugin missing pluginId or name', () => {
    const noId = { ...singlePage, pluginId: '' };
    const noName = { ...singlePage, name: '' };

    expect(partitionInvalidPlugins([noId])).toEqual({ valid: [], invalid: [{ module: noId, missingFields: ['pluginId'] }] });
    expect(partitionInvalidPlugins([noName])).toEqual({ valid: [], invalid: [{ module: noName, missingFields: ['name'] }] });
  });

  it('flags a single-page plugin missing route or Page', () => {
    const noRoute = { pluginId: 'no-route', type: PluginType.SINGLE_PAGE, name: 'no-route', Page } as RemotePlugin;
    const noPage = { pluginId: 'no-page', type: PluginType.SINGLE_PAGE, name: 'no-page', route: '/x' } as RemotePlugin;

    expect(partitionInvalidPlugins([noRoute])).toEqual({ valid: [], invalid: [{ module: noRoute, missingFields: ['route'] }] });
    expect(partitionInvalidPlugins([noPage])).toEqual({ valid: [], invalid: [{ module: noPage, missingFields: ['Page'] }] });
  });

  it('flags a new-tab plugin missing targetUrl', () => {
    const noUrl = { pluginId: 'no-url', type: PluginType.NEW_TAB, name: 'no-url' } as RemotePlugin;

    expect(partitionInvalidPlugins([noUrl])).toEqual({ valid: [], invalid: [{ module: noUrl, missingFields: ['targetUrl'] }] });
  });

  it('flags a plugin with an unrecognized type', () => {
    const badType = { pluginId: 'bad-type', name: 'bad-type', type: 'not-a-type' } as unknown as RemotePlugin;

    expect(partitionInvalidPlugins([badType])).toEqual({ valid: [], invalid: [{ module: badType, missingFields: ['type'] }] });
  });
});

describe('partitionDuplicatePluginIds', () => {
  it('treats every module as unique when pluginIds do not collide', () => {
    expect(partitionDuplicatePluginIds([singlePage, newTab, mapInfoCard])).toEqual({
      unique: [singlePage, newTab, mapInfoCard],
      duplicates: [],
    });
  });

  it('keeps the first module for a colliding pluginId and reports the rest as duplicates', () => {
    const laterDuplicate: RemotePlugin = { ...newTab, name: 'later-tab', pluginId: singlePage.pluginId };

    expect(partitionDuplicatePluginIds([singlePage, laterDuplicate])).toEqual({
      unique: [singlePage],
      duplicates: [laterDuplicate],
    });
  });

  it('detects multiple independent duplicate groups', () => {
    const singlePageDuplicate: RemotePlugin = { ...singlePage, name: 'single-again' };
    const newTabDuplicate: RemotePlugin = { ...newTab, name: 'tab-again' };

    expect(partitionDuplicatePluginIds([singlePage, newTab, singlePageDuplicate, newTabDuplicate])).toEqual({
      unique: [singlePage, newTab],
      duplicates: [singlePageDuplicate, newTabDuplicate],
    });
  });
});

describe('partitionInvalidMapInfoCards', () => {
  it('accepts a map info card module', () => {
    expect(partitionInvalidMapInfoCards([mapInfoCard])).toEqual({ valid: [mapInfoCard], invalid: [] });
  });

  it('flags a card module of another type', () => {
    expect(partitionInvalidMapInfoCards([singlePage])).toEqual({ valid: [], invalid: [{ module: singlePage, missingFields: ['type'] }] });
  });

  it('flags a card module without a Page', () => {
    const noPage = { ...mapInfoCard, Page: undefined };

    expect(partitionInvalidMapInfoCards([noPage])).toEqual({ valid: [], invalid: [{ module: noPage, missingFields: ['Page'] }] });
  });
});

describe('pairMapInfoCards', () => {
  const card = { ...mapInfoCard, pluginId: singlePage.pluginId } as MapInfoCardPlugin;

  it('pairs a card with the route of the single-page plugin with the same pluginId', () => {
    expect(pairMapInfoCards([card], [newTab, singlePage])).toEqual([{ card, route: '/single' }]);
  });

  it('drops a card whose single-page plugin is not available', () => {
    expect(pairMapInfoCards([card], [newTab])).toEqual([]);
  });

  it("pairs a card only with its own remote's page when two remotes share a pluginId", () => {
    const pageA = { ...singlePage, remoteUrl: 'https://a.example/mf-manifest.json' };
    const cardA = { ...card, remoteUrl: pageA.remoteUrl };
    const cardB = { ...card, remoteUrl: 'https://b.example/mf-manifest.json' };

    expect(pairMapInfoCards([cardA, cardB], [pageA])).toEqual([{ card: cardA, route: '/single' }]);
  });

  it('drops a card whose plugin is not a single-page plugin', () => {
    const tabCard = { ...mapInfoCard, pluginId: newTab.pluginId } as MapInfoCardPlugin;

    expect(pairMapInfoCards([tabCard], [newTab])).toEqual([]);
  });
});

describe('loadRemotes', () => {
  const toConfig = (url: string): Plugin => ({ url, enabled: true, mustBeLoggedIn: false, enableACL: false, acl: [] });

  beforeEach(() => {
    loadRemote.mockReset();
  });

  it('separates modules that resolved from remotes whose load rejected', async () => {
    const okUrl = 'https://good-remote.example/mf-manifest.json';
    const badUrl = 'https://bad-remote.example/mf-manifest.json';

    loadRemote.mockImplementation((url: string) =>
      url === okUrl ? Promise.resolve(singlePage) : Promise.reject(new Error('network error')),
    );

    const result = await loadRemotes([toConfig(okUrl), toConfig(badUrl)]);

    expect(result).toEqual({
      loaded: [{ ...singlePage, requiresAuth: false, remoteUrl: okUrl }],
      failed: [badUrl],
      cards: [],
    });
  });

  it("keeps the operator's remote url, made absolute, never one the module exports", async () => {
    loadRemote.mockResolvedValue({ ...singlePage, remoteUrl: 'https://evil.example/mf-manifest.json' });

    const result = await loadRemotes([toConfig('/plugins/zones/mf-manifest.json')]);

    expect(result.loaded[0].remoteUrl).toBe(`${window.location.origin}/plugins/zones/mf-manifest.json`);
  });

  it.each<[string, unknown, boolean, boolean]>([
    ['neither flag', undefined, false, false],
    ["only the plugin's requiresAuth", true, false, true],
    ["only the operator's mustBeLoggedIn", undefined, true, true],
    ['both flags', true, true, true],
    ['a malformed truthy requiresAuth', 'false', false, true],
  ])('requires a signed-in user with %s', async (_label, requiresAuth, mustBeLoggedIn, expected) => {
    const url = 'https://remote.example/mf-manifest.json';
    loadRemote.mockResolvedValue({ ...singlePage, requiresAuth });

    const result = await loadRemotes([{ ...toConfig(url), mustBeLoggedIn }]);

    expect(result.loaded[0].requiresAuth).toBe(expected);
  });

  it('restores the real console after overlapping loads', async () => {
    const realError = console.error;
    const realWarn = console.warn;
    const resolvers: ((module: RemotePlugin) => void)[] = [];
    // Only the page loads are held open; each card load then fails at once.
    loadRemote.mockImplementation((id: string) =>
      id.endsWith('/mapInfoCard') ? Promise.reject(new Error('no such expose')) : new Promise(resolve => resolvers.push(resolve)),
    );

    const first = loadRemotes([toConfig('https://first.example/mf-manifest.json')]);
    const second = loadRemotes([toConfig('https://second.example/mf-manifest.json')]);
    resolvers[0](singlePage);
    await first;
    resolvers[1](singlePage);
    await second;

    expect(console.error).toBe(realError);
    expect(console.warn).toBe(realWarn);
  });

  it('loads the map info card of every remote whose page loaded, with no flag in its config', async () => {
    const url = 'https://remote.example/mf-manifest.json';
    loadRemote.mockImplementation((id: string) => Promise.resolve(id === `${url}/mapInfoCard` ? mapInfoCard : singlePage));

    const result = await loadRemotes([toConfig(url)]);

    expect(loadRemote).toHaveBeenCalledWith(`${url}/mapInfoCard`);
    expect(result).toEqual({
      loaded: [{ ...singlePage, requiresAuth: false, remoteUrl: url }],
      failed: [],
      cards: [{ ...mapInfoCard, remoteUrl: url }],
    });
  });

  it('keeps the page and reports nothing when the map info card fails to load', async () => {
    const url = 'https://remote.example/mf-manifest.json';
    loadRemote.mockImplementation((id: string) =>
      id === `${url}/mapInfoCard` ? Promise.reject(new Error('no such expose')) : Promise.resolve(singlePage),
    );

    const result = await loadRemotes([toConfig(url)]);

    expect(result).toEqual({ loaded: [{ ...singlePage, requiresAuth: false, remoteUrl: url }], failed: [], cards: [] });
  });

  it('treats a card the fallback plugin served as missing, without leaking its id into later loads', async () => {
    const url = 'https://remote.example/mf-manifest.json';
    const cardId = `${url}/mapInfoCard`;
    // The real MF runtime: a missing expose throws inside loadRemote, which emits errorLoadRemote
    // and resolves with the fallback instead of rejecting.
    loadRemote.mockImplementation(async (id: string) => {
      if (id !== cardId) return singlePage;
      return fallbackPlugin.errorLoadRemote({ id, lifecycle: 'onLoad' });
    });

    const missing = await loadRemotes([toConfig(url)]);

    expect(missing).toEqual({ loaded: [{ ...singlePage, requiresAuth: false, remoteUrl: url }], failed: [], cards: [] });

    loadRemote.mockImplementation((id: string) => Promise.resolve(id === cardId ? mapInfoCard : singlePage));

    const later = await loadRemotes([toConfig(url)]);

    expect(later.cards).toEqual([{ ...mapInfoCard, remoteUrl: url }]);
  });

  it('does not attempt the map info card of a remote whose page failed to load', async () => {
    const url = 'https://remote.example/mf-manifest.json';
    loadRemote.mockRejectedValue(new Error('network error'));

    const result = await loadRemotes([toConfig(url)]);

    expect(loadRemote).not.toHaveBeenCalledWith(`${url}/mapInfoCard`);
    expect(result).toEqual({ loaded: [], failed: [url], cards: [] });
  });

  it('ignores disabled remotes entirely', async () => {
    const disabledUrl = 'https://disabled-remote.example/mf-manifest.json';
    loadRemote.mockResolvedValue(singlePage);

    const result = await loadRemotes([{ ...toConfig(disabledUrl), enabled: false }]);

    expect(result).toEqual({ loaded: [], failed: [], cards: [] });
    expect(loadRemote).not.toHaveBeenCalled();
  });
});
