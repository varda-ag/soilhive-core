# Download links are signed with a key of their own

**Status:** Accepted.

`SELF_SIGNING_SECRET` signed two kinds of token with one key and one kid (`internal-request`): the internal-request token, a **Privileged caller**, and the token in a presigned download link. Each check refused the other kind only because of claims it happened to lack: a download token has no `iss` or `sub`, and an internal-request token has no `filePath`. ADR 0064 skipped an audience check because platform keys "sign nothing else", which was not true of this one.

Download tokens are now signed with an HS256 key derived from `SELF_SIGNING_SECRET` with HKDF, under the kid `download-link`, and `verifySignedPath` accepts only that key. The token validator has no key for that kid, so it refuses a download token whatever claims it carries, and an internal-request token never verifies as a download token. `signToken` becomes `signInternalRequestToken()`. It takes no payload, so a new kind of token can't reuse the internal-request key by accident, and its tokens now expire after 5 minutes instead of never.

## Considered options

- **An `aud` claim on both kinds, same key**: rejected. It still depends on every future signer setting it.
- **Accepting the old key too during the switch**: rejected. ADR 0060 rules out fallback keys, and a download link lasts 30 seconds.
- **A new env var for the download key**: rejected. Deriving it needs no deployment change, as with the Password-grant key (ADR 0060).

## Consequences

- During a rolling deploy, a link signed on an old replica fails on a new one, and the other way round. The frontend signs a fresh link on each click, so a second click works.
- Rotating `SELF_SIGNING_SECRET` still rotates every key derived from it.
- An internal-request token must reach the API within 5 minutes of being signed. `makeRequest` signs one per call, just before sending it.
- A new kind of signed token, such as a config share link, gets its own derived key and kid.
