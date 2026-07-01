// Stub the MF runtime so importing moduleFederation.ts doesn't spin up the real
// host at module load; these tests only exercise the pure plugin type guards.
jest.mock('@module-federation/enhanced/runtime', () => ({
  createInstance: jest.fn(() => ({
    registerShared: jest.fn(),
    registerRemotes: jest.fn(),
    loadRemote: jest.fn(),
  })),
}));

import { isNewTabModule, isSinglePageModule } from 'utilities/moduleFederation';
import { PluginType, type RemotePlugin } from '../../src/types/plugins';

const Page = () => null;

const singlePage: RemotePlugin = { type: PluginType.SINGLE_PAGE, name: 'single', route: '/single', Page };
const newTab: RemotePlugin = { type: PluginType.NEW_TAB, name: 'tab', targetUrl: 'https://example.com' };
const mapInfoCard: RemotePlugin = { type: PluginType.MAP_INFO_CARD, name: 'card', Page };

describe('isSinglePageModule', () => {
  it('accepts a single-page plugin with a route and a Page', () => {
    expect(isSinglePageModule(singlePage)).toBe(true);
  });

  it('rejects other plugin types', () => {
    expect(isSinglePageModule(newTab)).toBe(false);
    expect(isSinglePageModule(mapInfoCard)).toBe(false);
  });

  it('rejects a single-page plugin missing a route or a Page', () => {
    expect(isSinglePageModule({ type: PluginType.SINGLE_PAGE, name: 'no-route', Page })).toBe(false);
    expect(isSinglePageModule({ type: PluginType.SINGLE_PAGE, name: 'no-page', route: '/x' })).toBe(false);
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
    expect(isNewTabModule({ type: PluginType.NEW_TAB, name: 'no-url' })).toBe(false);
  });
});
