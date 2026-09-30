# A plugin's sign-in requirement is the union of its own flag and the operator's

A Plugin that cannot work without a Signed-in user (dashboards) says so itself by exporting `requiresAuth` from its Remote Plugin. The host's per-deployment `Plugin` config already had `mustBeLoggedIn`, documented but never enforced. We keep both and gate the Plugin when either is set: `requiresAuth` is a fact about the Plugin, true on every deployment, while `mustBeLoggedIn` is one deployment's policy. Neither can lift the other, so an operator cannot expose dashboards to anonymous visitors and a Plugin cannot opt out of an operator's restriction.

## Considered options

- **Replace `mustBeLoggedIn` with `requiresAuth`**: rejected, operators lose the ability to restrict a Plugin that works fine anonymously.
- **Enforce only `mustBeLoggedIn`**: rejected, every deployment would have to remember to set it for dashboards, and forgetting shows a broken page.

## Consequences

- `mustBeLoggedIn` is enforced for the first time, so any existing config row with it set to `true` starts hiding that Plugin from anonymous visitors.
- `enableACL`/`acl` are still not enforced.
- This is frontend gating only. The backend still decides what a caller may read or write.
