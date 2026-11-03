import { renderHook } from '@testing-library/react';
import useTheme from 'hooks/useTheme';
import useDevice from 'hooks/useDevice';
import { useDownloadSignInHint } from 'hooks/useDownloadSignInHint';
import { useAuthContext } from '../../src/auth/AuthContextProvider';

jest.mock('hooks/useTheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('hooks/useDevice', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../src/auth/AuthContextProvider', () => ({
  useAuthContext: jest.fn(),
}));

const hintFor = (exportLimits: object | undefined, isAuthenticated: boolean, isMobileDevice = false) => {
  (useTheme as jest.Mock).mockReturnValue({ themeConfig: { exportLimits } });
  (useAuthContext as jest.Mock).mockReturnValue({ isAuthenticated });
  (useDevice as jest.Mock).mockReturnValue({ isMobileDevice });
  return renderHook(() => useDownloadSignInHint()).result.current;
};

describe('useDownloadSignInHint', () => {
  it('tells a signed-out visitor to log in while a signed-in user is required to download', () => {
    expect(hintFor({ exportRequiresSignIn: true }, false)).toBe('You need to be logged in to download data.');
  });

  it('is undefined on a phone, which cannot download whoever is signed in', () => {
    expect(hintFor({ exportRequiresSignIn: true }, false, true)).toBeUndefined();
  });

  it('is undefined for a signed-in user', () => {
    expect(hintFor({ exportRequiresSignIn: true }, true)).toBeUndefined();
  });

  it.each([{ exportRequiresSignIn: false }, {}, undefined])('is undefined while sign-in is not required (%o)', exportLimits => {
    expect(hintFor(exportLimits, false)).toBeUndefined();
  });
});
