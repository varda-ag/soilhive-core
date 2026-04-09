// usePasswordAuth.test.ts
import { jwtDecode } from 'jwt-decode';
import { usePasswordAuth } from '../../src/auth/usePasswordAuth';
import { useRequest } from '../../src/api-client';
import { clearToken, getToken, saveToken } from '../../src/auth/tokenStore';
import { BACKEND_BASE_URL } from '../../src/configuration/api';
import { act, renderHook } from '@testing-library/react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('jwt-decode', () => ({
  jwtDecode: jest.fn(),
}));

jest.mock('../../src/api-client', () => ({
  useRequest: jest.fn(),
}));

jest.mock('../../src/auth/tokenStore', () => ({
  getToken: jest.fn(),
  saveToken: jest.fn(),
  clearToken: jest.fn(),
}));

jest.mock('../../src/configuration/api', () => ({
  BACKEND_BASE_URL: 'https://api.example.com',
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FUTURE_EXP = Math.floor(Date.now() / 1000) + 3600; // +1 hour
const PAST_EXP = Math.floor(Date.now() / 1000) - 3600; // -1 hour

const mockDecodedToken = (overrides = {}) => ({
  sub: 'user-123',
  iat: 1700000000,
  exp: FUTURE_EXP,
  scope: 'openid profile',
  given_name: 'John',
  family_name: 'Doe',
  email: 'john.doe@example.com',
  ...overrides,
});

const MOCK_ACCESS_TOKEN = 'mock.access.token';

// ─── Setup helpers ────────────────────────────────────────────────────────────

const mockRequest = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();

  (useRequest as jest.Mock).mockReturnValue({ request: mockRequest });
  (getToken as jest.Mock).mockReturnValue(null);
  (jwtDecode as jest.Mock).mockReturnValue(mockDecodedToken());
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('usePasswordAuth', () => {
  // ── Initialization ──────────────────────────────────────────────────────────

  describe('initialization', () => {
    it('starts unauthenticated when no token is stored', () => {
      (getToken as jest.Mock).mockReturnValue(null);

      const { result } = renderHook(() => usePasswordAuth());

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeUndefined();
      expect(result.current.user).toBeUndefined();
    });

    it('starts authenticated when a valid non-expired token is stored', () => {
      (getToken as jest.Mock).mockReturnValue(MOCK_ACCESS_TOKEN);
      (jwtDecode as jest.Mock).mockReturnValue(mockDecodedToken({ exp: FUTURE_EXP }));

      const { result } = renderHook(() => usePasswordAuth());

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.user).toMatchObject({
        scope: 'openid profile',
        expires_at: FUTURE_EXP,
        access_token: MOCK_ACCESS_TOKEN,
        profile: {
          sub: 'user-123',
          name: 'user-123',
          given_name: 'John',
          family_name: 'Doe',
          email: 'john.doe@example.com',
        },
      });
    });

    it('clears an expired stored token and starts unauthenticated', () => {
      (getToken as jest.Mock).mockReturnValue(MOCK_ACCESS_TOKEN);
      // expired = exp is in the past, also within buffer window
      (jwtDecode as jest.Mock).mockReturnValue(mockDecodedToken({ exp: PAST_EXP }));

      const { result } = renderHook(() => usePasswordAuth());

      expect(clearToken).toHaveBeenCalledTimes(1);
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeUndefined();
    });

    it('treats a token without exp as expired and clears it', () => {
      (getToken as jest.Mock).mockReturnValue(MOCK_ACCESS_TOKEN);
      (jwtDecode as jest.Mock).mockReturnValue(mockDecodedToken({ exp: undefined }));

      const { result } = renderHook(() => usePasswordAuth());

      expect(clearToken).toHaveBeenCalledTimes(1);
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('treats a token expiring within the 30-second buffer as expired', () => {
      // exp is 15 seconds in the future — inside the 30s buffer
      const nearExp = Math.floor(Date.now() / 1000) + 15;
      (getToken as jest.Mock).mockReturnValue(MOCK_ACCESS_TOKEN);
      (jwtDecode as jest.Mock).mockReturnValue(mockDecodedToken({ exp: nearExp }));

      const { result } = renderHook(() => usePasswordAuth());

      expect(clearToken).toHaveBeenCalledTimes(1);
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  // ── login ───────────────────────────────────────────────────────────────────

  describe('login', () => {
    const rawTokenResponse = {
      access_token: MOCK_ACCESS_TOKEN,
      expires_in: 3600,
      token_type: 'Bearer',
    };

    it('sets isLoading true while the request is in-flight', async () => {
      let resolveRequest!: (v: unknown) => void;
      mockRequest.mockReturnValue(
        new Promise(res => {
          resolveRequest = res;
        }),
      );

      const { result } = renderHook(() => usePasswordAuth());

      act(() => {
        result.current.login('secret');
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.error).toBeUndefined();

      // Resolve to avoid dangling promise
      await act(async () => {
        resolveRequest(rawTokenResponse);
      });
    });

    it('authenticates successfully with a provided password', async () => {
      mockRequest.mockResolvedValue(rawTokenResponse);
      (jwtDecode as jest.Mock).mockReturnValue(mockDecodedToken());

      const { result } = renderHook(() => usePasswordAuth());

      await act(async () => {
        await result.current.login('mypassword');
      });

      expect(mockRequest).toHaveBeenCalledWith({
        url: `${BACKEND_BASE_URL}/oauth/token`,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'password',
          username: '_',
          password: 'mypassword',
        }).toString(),
      });

      expect(saveToken).toHaveBeenCalledWith(MOCK_ACCESS_TOKEN);
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeUndefined();
      expect(result.current.user?.access_token).toBe(MOCK_ACCESS_TOKEN);
    });

    it('authenticates with an empty string when no password is provided', async () => {
      mockRequest.mockResolvedValue(rawTokenResponse);

      const { result } = renderHook(() => usePasswordAuth());

      await act(async () => {
        await result.current.login();
      });

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          body: new URLSearchParams({
            grant_type: 'password',
            username: '_',
            password: '',
          }).toString(),
        }),
      );

      expect(result.current.isAuthenticated).toBe(true);
    });

    it('sets error state and rethrows when the request fails', async () => {
      const networkError = new Error('Network failure');
      mockRequest.mockRejectedValue(networkError);

      const { result } = renderHook(() => usePasswordAuth());

      // Capture the error without letting .rejects interrupt act's flush cycle
      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.login('bad-password');
        } catch (e) {
          thrownError = e as Error;
        }
      });

      // Now all setState calls inside login's catch block have been flushed
      expect(thrownError).toBe(networkError);
      expect(result.current.error).toBe(networkError);
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.user).toBeNull();
      expect(saveToken).not.toHaveBeenCalled();
    });

    it('clears previous error on a new login attempt', async () => {
      const networkError = new Error('First failure');
      mockRequest.mockRejectedValueOnce(networkError).mockResolvedValueOnce(rawTokenResponse);

      const { result } = renderHook(() => usePasswordAuth());

      // ── First call: capture thrown error inside act so setState is flushed ──
      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.login('wrong');
        } catch (e) {
          thrownError = e as Error;
        }
      });

      expect(thrownError).toBe(networkError);
      expect(result.current.error).toBe(networkError);

      // ── Second call: succeeds and clears the error ──
      await act(async () => {
        await result.current.login('correct');
      });

      expect(result.current.error).toBeUndefined();
      expect(result.current.isAuthenticated).toBe(true);
    });
  });

  // ── logout ──────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('clears the token and resets to unauthenticated state', async () => {
      mockRequest.mockResolvedValue({
        access_token: MOCK_ACCESS_TOKEN,
        expires_in: 3600,
        token_type: 'Bearer',
      });

      const { result } = renderHook(() => usePasswordAuth());

      // First login so we have an authenticated state to log out from
      await act(async () => {
        await result.current.login('pass');
      });
      expect(result.current.isAuthenticated).toBe(true);

      act(() => {
        result.current.logout();
      });

      expect(clearToken).toHaveBeenCalled();
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeUndefined();
      expect(result.current.user).toBeNull();
    });

    it('can logout even when already unauthenticated', () => {
      const { result } = renderHook(() => usePasswordAuth());

      act(() => {
        result.current.logout();
      });

      expect(clearToken).toHaveBeenCalledTimes(1);
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  // ── extractUser / user shape ─────────────────────────────────────────────────

  describe('user profile shape', () => {
    it('correctly maps all JWT claims to the User object', async () => {
      const decoded = mockDecodedToken({
        sub: 'abc-789',
        iat: 1710000000,
        exp: FUTURE_EXP,
        scope: 'read write',
        given_name: 'Jane',
        family_name: 'Smith',
        email: 'jane.smith@example.com',
      });

      mockRequest.mockResolvedValue({
        access_token: MOCK_ACCESS_TOKEN,
        expires_in: 3600,
        token_type: 'Bearer',
      });
      (jwtDecode as jest.Mock).mockReturnValue(decoded);

      const { result } = renderHook(() => usePasswordAuth());

      await act(async () => {
        await result.current.login('pass');
      });

      expect(result.current.user).toEqual({
        scope: 'read write',
        expires_at: FUTURE_EXP,
        access_token: MOCK_ACCESS_TOKEN,
        profile: {
          iat: 1710000000,
          sub: 'abc-789',
          name: 'abc-789', // name is derived from sub
          given_name: 'Jane',
          family_name: 'Smith',
          email: 'jane.smith@example.com',
        },
      });
    });
  });
});
