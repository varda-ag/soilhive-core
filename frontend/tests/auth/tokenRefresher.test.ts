// tokenRefresher.test.ts
//
// Covers the module-level bridge that lets the standalone httpClient trigger an
// OIDC silent renew: delegation to the registered refresher and the dedupe of
// concurrent calls into a single renew.
import { setTokenRefresher, refreshAccessToken } from '../../src/auth/tokenRefresher';

afterEach(() => {
  setTokenRefresher(undefined);
});

describe('tokenRefresher', () => {
  it('resolves to undefined when no refresher is registered', async () => {
    await expect(refreshAccessToken()).resolves.toBeUndefined();
  });

  it('delegates to the registered refresher and returns its token', async () => {
    const fn = jest.fn().mockResolvedValue('new-token');
    setTokenRefresher(fn);

    await expect(refreshAccessToken()).resolves.toBe('new-token');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent calls into a single underlying refresh', async () => {
    let resolve!: (token: string) => void;
    const fn = jest.fn().mockImplementation(() => new Promise<string>(r => (resolve = r)));
    setTokenRefresher(fn);

    const p1 = refreshAccessToken();
    const p2 = refreshAccessToken();
    expect(fn).toHaveBeenCalledTimes(1);

    resolve('tok');
    await expect(p1).resolves.toBe('tok');
    await expect(p2).resolves.toBe('tok');
  });

  it('allows a new refresh once the previous one has settled', async () => {
    const fn = jest.fn().mockResolvedValueOnce('a').mockResolvedValueOnce('b');
    setTokenRefresher(fn);

    await expect(refreshAccessToken()).resolves.toBe('a');
    await expect(refreshAccessToken()).resolves.toBe('b');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('clears the inflight refresh after a rejection so later calls retry', async () => {
    const fn = jest.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce('ok');
    setTokenRefresher(fn);

    await expect(refreshAccessToken()).rejects.toThrow('fail');
    await expect(refreshAccessToken()).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('stops delegating after the refresher is unset', async () => {
    const fn = jest.fn().mockResolvedValue('x');
    setTokenRefresher(fn);
    setTokenRefresher(undefined);

    await expect(refreshAccessToken()).resolves.toBeUndefined();
    expect(fn).not.toHaveBeenCalled();
  });
});
