import { renderHook } from '@testing-library/react';
import useTheme from 'hooks/useTheme';
import { useIsSignInRequiredToDownload } from 'hooks/useIsSignInRequiredToDownload';
import { useAuthContext } from '../../src/auth/AuthContextProvider';

jest.mock('hooks/useTheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../src/auth/AuthContextProvider', () => ({
  useAuthContext: jest.fn(),
}));

const isRequired = (exportLimits: object | undefined, isAuthenticated: boolean) => {
  (useTheme as jest.Mock).mockReturnValue({ themeConfig: { exportLimits } });
  (useAuthContext as jest.Mock).mockReturnValue({ isAuthenticated });
  return renderHook(() => useIsSignInRequiredToDownload()).result.current;
};

describe('useIsSignInRequiredToDownload', () => {
  it('is true for a signed-out visitor while a signed-in user is required to download', () => {
    expect(isRequired({ exportRequiresSignIn: true }, false)).toBe(true);
  });

  it('is false for a signed-in user', () => {
    expect(isRequired({ exportRequiresSignIn: true }, true)).toBe(false);
  });

  it.each([{ exportRequiresSignIn: false }, {}, undefined])('is false while sign-in is not required (%o)', exportLimits => {
    expect(isRequired(exportLimits, false)).toBe(false);
  });
});
