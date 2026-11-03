# An Export can require a signed-in caller, judged only at submission

Administrators can require a signed-in caller to export, an option the legacy platform had. The flag is `exportRequiresSignIn` in the theme config's `exportLimits`, saved from the Export settings page beside the Export Limits, though it is not one: it bounds who may export, not how much. While it is set, `POST /jobs` refuses an Export from a caller with no token with `401`, before any Dataset is checked, since signing in may grant the `download` the caller lacks. The frontend disables its download buttons for a signed-out visitor and says why on hover, as the legacy platform disabled its own.

## Considered options

- **Judge it again when the job runs, like the Export Limits**: rejected. Who submitted an Export cannot change once it is queued, so a second check would only catch anonymous Exports queued in the moments before the flag was set.
- **A config id of its own**: rejected for the reasons in ADR 0055. The frontend needs the flag for anonymous visitors, and `theme` is already readable by everyone.
- **`403`**: rejected. A token is exactly what the caller is missing, and with one the request may succeed.
- **Sending the visitor to sign in when they click Download**: rejected. The legacy platform disabled the button instead, and after an OIDC sign-in the map comes back without the visitor's selection.

## Consequences

- Exports queued before the flag was set still run, and their Export Bundles stay downloadable by job id until the Export is forgotten.
- A Machine caller has a token, so it can still export.
- In password mode only administrators can sign in, so only they can export.
- With no identity system nobody can sign in, so the flag, which can only have been set in another auth mode, leaves nobody able to export.
