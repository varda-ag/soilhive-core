import { renderHook } from '@testing-library/react';

import useRemotes from 'hooks/useRemotes';
import { RemotesContext } from '../../src/contexts/RemotesContext';
import type { SinglePageModule } from '../../src/utilities/moduleFederation';

// RemotesContext transitively imports useTheme -> ThemeContext -> App -> i18n.
// Mock useTheme to cut that chain; the hook under test never reads it here.
jest.mock('hooks/useTheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const Page = () => null;

const singlePageModule: SinglePageModule = {
  name: 'single-page-module',
  type: 'single-page',
  route: '/remote',
  Page,
};

const contextValue = {
  modules: [singlePageModule],
  singlePages: [singlePageModule],
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
