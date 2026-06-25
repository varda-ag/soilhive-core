// Bridges the standalone httpClient (outside React) to the OIDC silent-renew,
// which lives on the React side (UserManager via react-oidc-context).
//
// The scheduled automaticSilentRenew can miss its window when the timer is
// throttled (background tab) or suspended (machine sleep), leaving an expired
// access token in storage. When a request then 401s, httpClient calls
// refreshAccessToken() to force a one-shot silent renew and retry.

type RefreshFn = () => Promise<string | undefined>;

let refreshFn: RefreshFn | undefined;
let inflight: Promise<string | undefined> | undefined;

export function setTokenRefresher(fn: RefreshFn | undefined) {
  refreshFn = fn;
}

export function refreshAccessToken(): Promise<string | undefined> {
  if (!refreshFn) return Promise.resolve(undefined);
  // Dedupe concurrent refreshes so a burst of 401s triggers a single silent renew.
  if (!inflight) {
    inflight = refreshFn().finally(() => {
      inflight = undefined;
    });
  }
  return inflight;
}
