// Bridges the standalone httpClient (outside React) to the OIDC silent-renew,
// which lives on the React side (UserManager via react-oidc-context).
//
// The scheduled automaticSilentRenew can miss its window when the timer is
// throttled (background tab) or suspended (machine sleep), leaving an expired
// access token in storage. When a request then 401s, httpClient calls
// refreshAccessToken() to force a one-shot silent renew and retry.

// How a renew ended. `rejected`: the IdP ended the session, or this auth mode cannot renew.
// `unavailable`: the IdP could not be reached (timeout, network), so the session may still be alive.
export type RenewResult = { outcome: 'renewed'; token: string } | { outcome: 'rejected' } | { outcome: 'unavailable' };

type RefreshFn = () => Promise<RenewResult>;

let refreshFn: RefreshFn | undefined;
let inflight: Promise<RenewResult> | undefined;

export function setTokenRefresher(fn: RefreshFn | undefined) {
  refreshFn = fn;
}

export function refreshAccessToken(): Promise<RenewResult> {
  if (!refreshFn) return Promise.resolve({ outcome: 'rejected' });
  // Dedupe concurrent refreshes so a burst of 401s triggers a single silent renew.
  if (!inflight) {
    inflight = refreshFn().finally(() => {
      inflight = undefined;
    });
  }
  return inflight;
}

// Ends the session in this tab. Called only when the IdP rejected a renew after a 401 or an expiry,
// never by a proactive renew, so a renew stays a renew.
type SessionEnder = () => void;

let sessionEnder: SessionEnder | undefined;

export function setSessionEnder(fn: SessionEnder | undefined) {
  sessionEnder = fn;
}

export function endSession(): void {
  sessionEnder?.();
}
