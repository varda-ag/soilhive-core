# An Export can require a signed-in caller, judged only at submission

Administrators can require a signed-in caller to export, an option the legacy platform had. The flag is `exportRequiresSignIn` in the theme config's `exportLimits`, saved from the Export settings page beside the Export Limits, though it is not one: it bounds who may export, not how much. While it is set, `POST /jobs` refuses an Export from a caller with no token with `401`, before any Dataset is checked, since signing in may grant the `download` the caller lacks. The frontend keeps its download buttons enabled. As on the legacy platform, a signed-out visitor who clicks one gets a "Please log in to download." dialog with Cancel and Log in. Under OIDC the sign-in reloads the app, and like the legacy platform it brings the visitor back to the page they were on, with the map's selection and filters, and on the Download Summary the Datasets and format chosen there; the visitor then clicks Download again. These travel in the sign-in's own state, beside the path to return to, so only a sign-in that succeeded brings them back. The Download Summary's and the Data Explorer's Back go to the page their label names when the identity provider is behind them.

## Considered options

- **Judge it again when the job runs, like the Export Limits**: rejected. Who submitted an Export cannot change once it is queued, so a second check would only catch anonymous Exports queued in the moments before the flag was set.
- **A config id of its own**: rejected for the reasons in ADR 0055. The frontend needs the flag for anonymous visitors, and `theme` is already readable by everyone.
- **`403`**: rejected. A token is exactly what the caller is missing, and with one the request may succeed.
- **Disabling the download buttons, with a line beside them saying why**: rejected. The legacy platform keeps Download enabled and asks the visitor to log in. A disabled button also says nothing to a keyboard or touch visitor unless a line explains it.
- **Returning from the map or the Data Explorer to the Download Summary their button leads to**, whose URL carries the Filter and the Datasets: rejected. Those are the Datasets a signed-out visitor may download, so a sign-in that grants more would not show them, and the Summary's Back would lead to the identity provider. Back on the map, the signed-in user's Download lists their own.
- **Keeping the selection in browser storage, restored when the app loads**: rejected. A sign-in abandoned at the identity provider would leave it behind, to come back on a later load. The sign-in's state is only handed back when the sign-in succeeds, as the legacy platform restored its stored map only on a load marked as the return from a login.

## Consequences

- Exports queued before the flag was set still run, and their Export Bundles stay downloadable by job id until the Export is forgotten.
- A Machine caller has a token, so it can still export.
- In password mode only administrators can sign in, so only they can export.
- With no identity system nobody can sign in, so the flag, which can only have been set in another auth mode, leaves nobody able to export.
- Not everything on the page comes back from a sign-in: the area card stays closed until a click in the selection, the Data Explorer's table and tab start afresh, and the Download Summary's terms are for the signed-in user to agree to.
