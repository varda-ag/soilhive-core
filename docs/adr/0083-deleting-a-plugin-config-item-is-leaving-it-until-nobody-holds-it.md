# Deleting a plugin config item is leaving it, until nobody holds it

**Status:** Accepted (SP-5990)

Invites let anyone gain `write` on a plugin config item, so one holder's delete must not remove it for the others. `DELETE /configs/{id}` on a `plugin:` item, from a caller who is not a **Privileged caller**, is a **Leave**: it drops the item from the caller's own pending Invites, then removes every grant the caller's own Subject holds on it, `read` or `write`. If no Subject but `everyone` still holds a grant on it, the Leave goes on to a **Delete**, as before: the row, every grant, the item in every pending Invite, and its attached Data Requests and Soil Index Runs. While `everyone` holds a grant on the item, a Leave would keep it in the caller's list, so the caller gets a 409 with `shared_with_everyone: true` and nothing changes, unless the caller is the last Subject holding one of its own, whose Leave Deletes it. `GET /configs` marks such a dashboard `shared_with_everyone: true`, so the plugin can leave out its remove button. A Privileged caller's delete is always a Delete. Whoever first saves a plugin config item gains `write` on it, a Privileged caller included, so an admin's item is not deleted when the last person it was shared with leaves. Host config items are unchanged.

## Considered options

- **Delete when the last `write` holder leaves**: rejected. Readers, who also arrive through Invites, would lose the item on someone else's click. A last writer who wants it gone can remove the other grants first.
- **Count `everyone`'s grants**: rejected. `everyone` never leaves, so the item could never go, and it would have no editor.
- **Only the `dashboards` Config Kind**: rejected. The rule is about grants, not content, and ADR 0079 already counts tying the generic route to one plugin as a cost.
- **A separate leave endpoint, keeping `DELETE` as it was**: rejected. Any writer could still call `DELETE` and remove the item for everyone.
- **A 204 that keeps the item visible through `everyone`**: rejected. The caller would be told it was removed while it stays in their list.

## Consequences

- It prevents accidental removal only. `write` still manages access, so a writer can remove the others' grants and then leave, which Deletes the item.
- An item can be left with readers and no writer. Only a Privileged caller can then edit or share it.
- A writer whose `write` another writer takes away still leaves pending Invites that fail at redemption (ADR 0082). Only a Leave cleans them up.
- Items an admin created before this change hold no grant for the admin. The Leave of the last non-admin holder Deletes them.
- Leaves of one item run one at a time on its config row, so of two last holders leaving together, the second Deletes.
- A writer can't step down to reading through `everyone`: only removing `everyone`'s grant, or a Privileged caller, gets a non-admin out of an item shared with everyone.
