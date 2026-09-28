# Plugin Data Requests are attached to their config item

Plugins store Data Request ids in their plugin config. Under ADR 0037 (bearer capability) every reader of that config could then destroy the results. So a Plugin submits every Data Request **attached** to one of its own config items: `POST /data-requests` takes `config_id`, requires `write` on it, and refuses an item that does not exist or is soft-deleted. `GET` needs `read` on the item and `DELETE` needs `write`, answering 404 before 403. `DELETE /config/{id}` destroys every Data Request attached to it. Unattached Data Requests keep ADR 0037's bearer semantics.

## Considered options

- **Declarative, ephemeral hook that never exposes the id (#853)**: rejected, dashboards need results that outlive a page view.
- **Creator-only `DELETE`**: rejected, a co-editor could not replace another editor's widget without orphaning its request.
- **A second delete secret in a writers-only config item**: rejected, two items' Entitlements must be kept in sync by hand.
- **No `DELETE`, retention only**: rejected, as in ADR 0037.
- **`POST` claims the config item on first access**: rejected, a second bootstrap path reopens the race ADR 0037 (config value endpoints) closed.

## Consequences

- A config item must be saved before anything can be attached to it, so a new dashboard is saved once before its first widget is submitted.
- Restoring a soft-deleted config item does not restore its Data Requests: every stored id reads as 404.
- Permission is checked at read time, so revoking `read` or `write` on the item revokes access to its Data Requests at once.
