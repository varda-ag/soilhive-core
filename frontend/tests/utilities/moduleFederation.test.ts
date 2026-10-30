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
  isSinglePageModule,
  loadRemotes,
  partitionDuplicatePluginIds,
  partitionInvalidPlugins,
  mf,
} from 'utilities/moduleFederation';
import { PluginType, type Plugin, type RemotePlugin } from '../../src/types/plugins';

// The MF runtime calls this hook for a remote or expose that fails to load (see fallbackPlugin).
const fallbackPlugin = (mf as unknown as { plugins: { errorLoadRemote: (args: { id: string; lifecycle: string }) => Promise<unknown> }[] })
  .plugins[0];

const Page = () => null;

const singlePage: RemotePlugin = { pluginId: 'single', type: PluginType.SINGLE_PAGE, name: 'single', route: '/single', Page };
const newTab: RemotePlugin = { pluginId: 'tab', type: PluginType.NEW_TAB, name: 'tab', targetUrl: 'https://example.com' };
const mapInfoCard: RemotePlugin = { pluginId: 'card', type: PluginType.MAP_INFO_CARD, name: 'card', Page };
// A page module that declares a './mapInfoCard' expose
const flaggedPage: RemotePlugin = { ...singlePage, hasMapInfoCard: true };

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
      failedCards: [],
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
    // Only the page loads are held open; each declared card load then fails at once.
    loadRemote.mockImplementation((id: string) =>
      id.endsWith('/mapInfoCard') ? Promise.reject(new Error('no such expose')) : new Promise(resolve => resolvers.push(resolve)),
    );

    const first = loadRemotes([toConfig('https://first.example/mf-manifest.json')]);
    const second = loadRemotes([toConfig('https://second.example/mf-manifest.json')]);
    resolvers[0](flaggedPage);
    await first;
    resolvers[1](flaggedPage);
    await second;

    expect(console.error).toBe(realError);
    expect(console.warn).toBe(realWarn);
  });

  it('does not load a map info card the page module does not declare', async () => {
    const url = 'https://remote.example/mf-manifest.json';
    loadRemote.mockImplementation((id: string) => Promise.resolve(id === `${url}/mapInfoCard` ? mapInfoCard : singlePage));

    const result = await loadRemotes([toConfig(url)]);

    expect(loadRemote).not.toHaveBeenCalledWith(`${url}/mapInfoCard`);
    expect(result).toEqual({ loaded: [{ ...singlePage, requiresAuth: false, remoteUrl: url }], failed: [], failedCards: [] });
  });

  it('attaches the declared map info card to its own plugin', async () => {
    const url = 'https://remote.example/mf-manifest.json';
    const CardPage = () => null;
    loadRemote.mockImplementation((id: string) =>
      Promise.resolve(id === `${url}/mapInfoCard` ? { ...mapInfoCard, Page: CardPage } : flaggedPage),
    );

    const result = await loadRemotes([toConfig(url)]);

    expect(result).toEqual({
      loaded: [{ ...flaggedPage, requiresAuth: false, remoteUrl: url, MapInfoCard: CardPage }],
      failed: [],
      failedCards: [],
    });
  });

  it('keeps the page without a card and reports the card when a declared card fails to load', async () => {
    const url = 'https://remote.example/mf-manifest.json';
    loadRemote.mockImplementation((id: string) =>
      id === `${url}/mapInfoCard` ? Promise.reject(new Error('no such expose')) : Promise.resolve(flaggedPage),
    );

    const result = await loadRemotes([toConfig(url)]);

    expect(result).toEqual({ loaded: [{ ...flaggedPage, requiresAuth: false, remoteUrl: url }], failed: [], failedCards: [url] });
  });

  it.each<[string, RemotePlugin]>([
    ['is of another type', singlePage],
    ['has no Page', { ...mapInfoCard, Page: undefined }],
  ])('reports a declared card module that %s and keeps the page without it', async (_label, module) => {
    const url = 'https://remote.example/mf-manifest.json';
    loadRemote.mockImplementation((id: string) => Promise.resolve(id === `${url}/mapInfoCard` ? module : flaggedPage));

    const result = await loadRemotes([toConfig(url)]);

    expect(result).toEqual({ loaded: [{ ...flaggedPage, requiresAuth: false, remoteUrl: url }], failed: [], failedCards: [url] });
  });

  it('treats a card the fallback plugin served as failed, without leaking its id into later loads', async () => {
    const url = 'https://remote.example/mf-manifest.json';
    const cardId = `${url}/mapInfoCard`;
    // The real MF runtime: a missing expose throws inside loadRemote, which emits errorLoadRemote
    // and resolves with the fallback instead of rejecting.
    loadRemote.mockImplementation(async (id: string) => {
      if (id !== cardId) return flaggedPage;
      return fallbackPlugin.errorLoadRemote({ id, lifecycle: 'onLoad' });
    });

    const missing = await loadRemotes([toConfig(url)]);

    expect(missing).toEqual({ loaded: [{ ...flaggedPage, requiresAuth: false, remoteUrl: url }], failed: [], failedCards: [url] });

    loadRemote.mockImplementation((id: string) => Promise.resolve(id === cardId ? mapInfoCard : flaggedPage));

    const later = await loadRemotes([toConfig(url)]);

    expect(later.loaded[0].MapInfoCard).toBe(Page);
    expect(later.failedCards).toEqual([]);
  });

  it('does not attempt the map info card of a remote whose page failed to load', async () => {
    const url = 'https://remote.example/mf-manifest.json';
    loadRemote.mockRejectedValue(new Error('network error'));

    const result = await loadRemotes([toConfig(url)]);

    expect(loadRemote).not.toHaveBeenCalledWith(`${url}/mapInfoCard`);
    expect(result).toEqual({ loaded: [], failed: [url], failedCards: [] });
  });

  it('ignores disabled remotes entirely', async () => {
    const disabledUrl = 'https://disabled-remote.example/mf-manifest.json';
    loadRemote.mockResolvedValue(singlePage);

    const result = await loadRemotes([{ ...toConfig(disabledUrl), enabled: false }]);

    expect(result).toEqual({ loaded: [], failed: [], failedCards: [] });
    expect(loadRemote).not.toHaveBeenCalled();
  });
});
