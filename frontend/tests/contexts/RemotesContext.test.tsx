import { render, waitFor } from '@testing-library/react';
import useRemotes from 'hooks/useRemotes';
import useTheme from 'hooks/useTheme';
import useNotifications from 'hooks/useNotifications';
import { loadRemotes } from 'utilities/moduleFederation';
import { RemotesProvider } from '../../src/contexts/RemotesContext';
import { PluginType, type RemotePlugin } from '../../src/types/plugins';

jest.mock('hooks/useTheme', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('hooks/useNotifications', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) =>
      options
        ? key.split('.').pop() +
          ' ' +
          Object.entries(options)
            .map(([k, v]) => `${k}=${v}`)
            .join(' ')
        : key,
  }),
}));

// Only loadRemotes is mocked; partitionDuplicatePluginIds runs for real so this
// test exercises the actual dedup behavior, not a stubbed version of it.
jest.mock('utilities/moduleFederation', () => ({
  ...jest.requireActual('utilities/moduleFederation'),
  loadRemotes: jest.fn(),
}));

const useThemeMock = useTheme as jest.MockedFunction<typeof useTheme>;
const useNotificationsMock = useNotifications as jest.MockedFunction<typeof useNotifications>;
const loadRemotesMock = loadRemotes as jest.MockedFunction<typeof loadRemotes>;

const Page = () => null;

const pluginA: RemotePlugin = { pluginId: 'dup', name: 'Plugin A', type: PluginType.SINGLE_PAGE, route: '/a', hasMenuItem: true, Page };
const pluginB: RemotePlugin = { pluginId: 'dup', name: 'Plugin B', type: PluginType.SINGLE_PAGE, route: '/b', hasMenuItem: true, Page };

const Consumer = () => {
  const { plugins, isLoadingRemotes } = useRemotes();
  return <div data-testid="plugins">{isLoadingRemotes ? 'loading' : plugins.map(plugin => plugin.name).join(',')}</div>;
};

describe('RemotesProvider', () => {
  const showNotification = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useThemeMock.mockReturnValue({ themeConfig: { plugins: [] }, isLoadingThemeConfig: false } as unknown as ReturnType<typeof useTheme>);
    useNotificationsMock.mockReturnValue({ notifications: [], showNotification, removeNotification: jest.fn() });
  });

  it('keeps the first plugin loaded for a pluginId and reports every later duplicate', async () => {
    loadRemotesMock.mockResolvedValue([pluginA, pluginB]);

    const { findByTestId } = render(
      <RemotesProvider>
        <Consumer />
      </RemotesProvider>,
    );

    await waitFor(async () => expect((await findByTestId('plugins')).textContent).toBe('Plugin A'));

    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'duplicate-plugin-id-dup', type: 'error', message: expect.stringContaining('Plugin B') }),
    );
  });

  it('does not notify when every loaded plugin has a distinct pluginId', async () => {
    loadRemotesMock.mockResolvedValue([pluginA, { ...pluginB, pluginId: 'not-a-dup' }]);

    const { findByTestId } = render(
      <RemotesProvider>
        <Consumer />
      </RemotesProvider>,
    );

    await waitFor(async () => expect((await findByTestId('plugins')).textContent).toBe('Plugin A,Plugin B'));

    expect(showNotification).not.toHaveBeenCalled();
  });
});
