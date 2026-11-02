# Dataset slugs resolve through slug history before entitlement checks

**Status:** Accepted — amends ADR 0057

An Export naming a renamed private Dataset by an old slug skipped the `download` check: the existence filter matched current slugs only, so it dropped the slug, and the job then resolved it through slug history and read the vector rows under `preview` alone. The existence filter (`existingDatasets`) now resolves slug history and returns the Datasets by current slug, deduplicated, in the order given. The check then runs on each Dataset found, not on the slugs as given, so no slug can skip it. The data-request run resolves `dataset_ids` the same way.

## Considered options

- **Resolve only in `POST /jobs`**: rejected. It leaves the filter failing open for every other caller.
- **Check `download` again in the export job**: rejected. A job cannot see external Entitlements, so it would refuse anyone holding local `preview` and external `download`.
- **Rewrite `dataset_ids` in the job data**: rejected. A list emptied by the filter means "every matching Dataset" to a data request, and would let an Export that should fail with 404 run.

## Consequences

- `GET /soil-data` returns rows for an old slug instead of none.
- A data request naming an old slug has `preview` checked at submission and no longer drops that Dataset from the run.
- The Export Limits pre-check (ADR 0070) counts Datasets named by an old slug.
