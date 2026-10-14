# Password-grant tokens are ES256 with a key derived from the signing secret

Envoy Gateway verifies **Password-grant tokens** against a remote JWKS, until now served by a separate cluster-internal server that published `SELF_SIGNING_SECRET` as an `oct` key. That secret also signs `internal-request` tokens (a **Privileged caller**) and presigned download URLs, so serving it from the API — public behind the gateway — would let anyone mint them. Password-grant tokens are therefore signed with ES256, and the API publishes only the public key at `/.well-known/jwks.json` (password mode only, 404 otherwise). The P-256 key is derived from `SELF_SIGNING_SECRET` via HKDF rather than configured: no new env var, password-mode detection and existing deployments are unchanged, and every replica derives the same key.

## Considered options

- **HS256 `oct` key on an internal-only port.** Smaller change, but its safety rests on routing config, and the published key mints Privileged tokens.
- **Dedicated private-key env var.** Conventional and rotates independently, but either breaks password-mode config or needs a second code path.

## Consequences

- Rotating `SELF_SIGNING_SECRET` rotates the key pair. The `kid` is the RFC 7638 thumbprint, so a rotation is a new key to Envoy, which may reject fresh tokens for up to its JWKS cache duration.
- A weak secret becomes offline-guessable from the public JWKS. No worse than before: presigned URLs already carry HS256 tokens signed with it.
- The validator dispatches on `kid` with pinned algorithms: `internal-request` → secret, HS256, every mode; the thumbprint → public key, ES256, password mode only. HS256 login tokens are rejected, so the deploy forces one re-login, and a deployment switched to OIDC drops Password-grant tokens immediately.
- Assumes `ENTITLEMENTS_ENDPOINT` is never used with password auth. It receives the raw token and would otherwise need the JWKS too.
