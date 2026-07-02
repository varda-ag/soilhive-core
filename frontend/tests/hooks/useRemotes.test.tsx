import { renderHook } from '@testing-library/react';

import useRemotes from 'hooks/useRemotes';
import { RemotesContext } from '../../src/contexts/RemotesContext';
import type { SinglePagePlugin } from '../../src/types/plugins';
import { PluginType } from '../../src/types/plugins';

// RemotesContext transitively imports useTheme -> ThemeContext -> App -> i18n.
// Mock useTheme to cut that chain; the hook under test never reads it here.
jest.mock('hooks/useTheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const Page = () => null;

const singlePageModule: SinglePagePlugin = {
  name: 'single-page-module',
  type: PluginType.SINGLE_PAGE,
  route: '/remote',
  hasMenuItem: true,
  Page,
};

const contextValue = {
  plugins: [singlePageModule],
  isLoadingRemotes: false,
};

describe('useRemotes', () => {
  it('returns the value provided by RemotesContext', () => {
    const { result } = renderHook(() => useRemotes(), {
      wrapper: ({ children }) => <RemotesContext.Provider value={contextValue}>{children}</RemotesContext.Provider>,
    });

    expect(result.current).toBe(contextValue);
  });

  it('throws when used outside of a RemotesProvider', () => {
    // Silence the React error-boundary console noise from the expected throw.
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => renderHook(() => useRemotes())).toThrow('useRemotes must be used within a RemotesProvider');

    consoleError.mockRestore();
  });
});
