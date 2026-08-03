# Identity is the Subject, not the token `sub`

Everything that records or authorises a caller — `datasets.created_by`, `files.created_by`, `data_mappings.created_by`, the `entitlements` table's `id`, and (as of SP-5521) a job's `created_by` — is keyed by the **Subject**: the token's `email` claim, else its `client_id`, else its `sub` (`getSubject`, `src/utils/auth.ts`). This is a deliberate inversion of the usual advice to key on the stable opaque `sub`, and jobs were the last place still keying on `sub` directly.

## Considered options

- **Subject, email-first (chosen).** Entitlements are granted by data admins through `PUT /datasets/{id}/entitlements`, where the id they type is a person's email — nobody knows a colleague's OIDC `sub`. Keying on the Subject means the grant, the audit trail (`created_by`) and the enforcement check all agree without a lookup table mapping emails to subs, and it keeps every `created_by` column legible to a human reading the database.
- **Token `sub` throughout (rejected).** Stable across email changes and never spoofable, but it makes grants unusable in practice: an admin would have to discover an opaque identifier before granting access, and every existing row would need migrating. It also does not help the `client_id` case, where there is no meaningful per-user `sub` at all.
- **A first-class user table mapping sub → email (rejected as premature).** The correct long-term answer if emails ever need to change while grants survive, but it introduces a user-provisioning concern the platform does not otherwise have.

## Consequences

- **An unverified `email` claim confers Entitlements.** The trust boundary is the identity provider: if it issues a token with an attacker-chosen `email`, that token inherits every Entitlement granted to that address. The `email_verified` claim is present but not enforced anywhere. Acceptable only because the IdP is trusted to issue truthful email claims; it must be re-examined before federating additional providers.
- **Changing a user's email revokes their access** and orphans their `created_by` rows, until an admin re-grants under the new address. There is no rename path.
- **A job runs under the Subject of its submitter.** `JobService.createJob` writes `created_by` via `getSubject`, and job ownership on read/cancel compares against the same value. Before SP-5521 jobs wrote `sub` here and then looked entitlements up by it, so no per-user row ever matched and every processor collapsed to `everyone`'s Entitlements — private Datasets the submitter was entitled to were silently skipped, and explicitly named ones failed the job with `SST_DATASET_NOT_ENTITLED` after the API had already accepted the request.
- **Jobs enqueued before this change are keyed by `sub`** and are therefore no longer matched by their submitter's ownership check. Given pg-boss retention this self-corrects; no migration is provided.
- **The external entitlements endpoint remains invisible to processors**, which have no raw token. Aligning the key fixes local Entitlements only; a Subject whose access is exclusively external still sees Datasets skipped in implicit mode. That gap is documented at `runDescriptiveStatistics` and unchanged here.
- **`BulkLoader` does not benefit yet**: it reads `created_by` off the pg-boss `Job` wrapper rather than `job.data`, so it resolves `undefined` regardless of what `createJob` writes. Tracked separately.
