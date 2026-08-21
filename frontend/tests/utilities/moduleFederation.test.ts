// Stub the MF runtime so importing moduleFederation.ts doesn't spin up the real
// host at module load; these tests only exercise the pure plugin type guards.
const loadRemote = jest.fn();
jest.mock('@module-federation/enhanced/runtime', () => ({
  createInstance: jest.fn(() => ({
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
} from 'utilities/moduleFederation';
import { PluginType, type Plugin, type RemotePlugin } from '../../src/types/plugins';

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

    expect(result).toEqual({ loaded: [singlePage], failed: [badUrl] });
  });

  it('ignores disabled remotes entirely', async () => {
    const disabledUrl = 'https://disabled-remote.example/mf-manifest.json';
    loadRemote.mockResolvedValue(singlePage);

    const result = await loadRemotes([{ ...toConfig(disabledUrl), enabled: false }]);

    expect(result).toEqual({ loaded: [], failed: [] });
    expect(loadRemote).not.toHaveBeenCalled();
  });
});
