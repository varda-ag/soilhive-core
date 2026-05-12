/**
 * Module-level SSR auth token store.
 *
 * Safe because React's renderToString is synchronous — only one render
 * runs at a time in a single Node.js event-loop tick, so there is no
 * concurrent-request race condition.
 *
 * If the server ever moves to streaming SSR or truly concurrent renders,
 * replace this with AsyncLocalStorage from 'node:async_hooks'.
 */
let _ssrAuthToken: string | null = null;

export const ssrAuthStore = {
  set: (token: string | null): void => {
    _ssrAuthToken = token;
  },
  get: (): string | null => _ssrAuthToken,
};
