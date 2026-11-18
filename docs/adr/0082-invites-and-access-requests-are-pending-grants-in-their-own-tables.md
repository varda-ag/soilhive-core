# Invites and Access Requests are pending grants in their own tables

**Status:** Accepted (SP-5967)

An **Invite** and an **Access Request** are both **Entitlements** waiting for one act: a redemption, or an admin's decision. Each lives in a table of its own. An Invite holds its grants in the same shape as `entitlements.data` (`{ datasets: {...}, configs: {...} }`), so redeeming merges them into the redeemer's row with the atomic union upsert that first-access self-grants already use (ADR 0054). The link carries a random 256-bit token in its URL fragment, so servers never log it, and only its sha256 is stored. A single-use Invite is used up by a conditional `UPDATE ... RETURNING` in the redeem transaction.

A creator may include only what they could grant directly: `write` on a config item, or being a **Privileged caller**, which Datasets always need. Config grants are checked again at redemption against the creator's local `write`. Dataset grants are not, because privilege comes from token scopes that can't be looked up later.

Entitlements do not record where they came from. Redemptions and decisions are recorded on the Invite and the Access Request instead, and taking access back is done on the Entitlements by hand.

## Considered options

- **Stateless signed links**, like download links (ADR 0080): rejected. They can't be single use, withdrawn, listed or audited, and a recipient or a pending request needs storage anyway.
- **Rows in JsonStorage**: rejected. Code that lists every config treats every row as one: the admin listing in `GET /entitlements`, `POST /configs-export`, and an admin's `PUT /configs/{id}`. Each would need a filter, and so would every future path.
- **Inside the config's value**: rejected. Every config read and save would have to strip or merge it, and creating or redeeming would change `updated_at`, which the dashboards list sorts by (ADR 0063). It also has no place for Datasets.
- **A stand-in Subject in `entitlements`** (`invite:{hash}`): rejected. A row id that is a secret breaks the meaning of **Subject**, the access editor would show hashes as people, and there is nowhere to keep an expiry or a recipient.
- **Recording the source of every Entitlement**: rejected. It changes the shape every access check reads, for a rare need.

## Consequences

- Withdrawing an Invite takes back nothing already redeemed.
- An admin who loses their role keeps their Dataset Invites valid until they expire (30 days at most). Any other admin can withdraw them.
- A **Purge** and the deletion of a plugin config item must also clean up pending Invites and Access Requests, so both paths gain a step. That step runs before the Entitlements are stripped, and a redeem reads its grants again under a row lock. So a redeem or an approval under way either commits its grant before the strip or finds the Dataset or config item already gone, and no grant is left behind.
