# A Subject that contains `@` is stored trimmed and in lowercase

**Status:** Proposed (SP-6055)

The same person could be stored under two strings: a grant typed as `Jane.Doe@example.com` didn't match a token carrying `jane.doe@example.com`, and two `entitlements` rows could differ only in case. `normalizeSubject` (`src/utils/auth.ts`) now trims and lowercases any Subject that contains `@`, whichever claim supplied it, and leaves every other Subject as the token spells it. It runs in `getSubject`, on the grant keys of `PUT /datasets/{datasetId}/entitlements` and `PUT /configs/{configId}/entitlements`, and on an Invite's recipient. Typed values are normalized without comment: the response shows the stored form, and two keys in one body that normalize alike have their capabilities merged.

A one-off migration rewrites every stored Subject with `@` that isn't in this form yet:

- looked up by Subject: `entitlements.id`, `invites.created_by`, `invites.recipient`, `access_requests.requested_by`, `access_request_items.requested_by`, `invite_redemptions.subject`
- history only: `created_by` / `updated_by` on datasets, files, data_mappings and raster_filters, and `access_request_items.decided_by`

Where two rows become one, `entitlements` rows merge their grants (the union of capabilities for each key, leaving out values that aren't lists, which `EntitlementService` already skips), the older of two pending `access_request_items` on the same Dataset stays pending and the newer is `withdrawn`, and duplicate `invite_redemptions` keep one row.

Filters now use the Subject as `owner`, like every other write. They used the raw `token.sub`, except a Run's derived Filters, which got the Subject through the job's rebuilt token. `data_filters.owner` is not migrated: we don't store which `sub` belongs to which email, so old rows keep their raw `sub` and dedup starts again once for each Filter. Since `owner` is now often an email, and `GET /data-filters/{filterId}` needs no token while Filter ids travel in shared links, `owner` is never in an API response. An ESLint rule allows reading `.sub` from a token only in `utils/auth.ts` and `tokenValidator.ts`, since that read is what split Filters from everything else.

## Considered options

- **Lowercase only values from the `email` claim**: rejected. A stored value doesn't say which claim it came from, so the migration couldn't follow the same rule, and an Okta `sub` is often a mixed-case email.
- **Lowercase every Subject**: rejected. Some identity providers' `sub` is case-sensitive (Entra ID), so people on a deployment without the email claim would lose their rows.
- **Refusing a typed value that isn't normalized (400)**: rejected. The person never chose the case, so there is nothing for them to fix.
- **Rewriting `created_by` in pg-boss's job data**: rejected. That schema belongs to the library and its layout changes between versions.

## Consequences

- Jobs queued before the deploy keep the old spelling, and we accept that. For up to 30 days (pg-boss retention), a job queued by someone whose email had capitals resolves only `everyone`'s Entitlements, so it skips their private Datasets and is missing from their job list. An identical new Export request doesn't join an unfinished Export from that time.
- An Invite recipient now matches exactly, since both sides are normalized. Subjects without `@` stay case-sensitive.
- Account Deletion must match `data_filters.owner` against the person's `sub` as well as their Subject.
