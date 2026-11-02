# An Export naming an absent Dataset is refused at submission

**Status:** Accepted — amends ADR 0057

`POST /jobs` left a Dataset that did not exist for the caller out of the `download` check and queued the Export with it. If that Dataset was Published before the job ran, the job read its vector rows under `preview` alone. An Export now answers 404 when any Dataset it names is absent, unknown and not Published alike, so every Dataset it queues has had `download` checked.

## Considered options

- **Check `download` again in the job**: rejected for the reason in ADR 0071: a job cannot see external Entitlements.
- **Drop the absent Datasets from the job data**: rejected. The Export would quietly be smaller than asked, and an emptied list would export nothing instead of failing.

## Consequences

- An Export that used to be queued and then fail with 404 in the job now fails with 404 at submission.
- An unpublished Dataset still reads exactly as an unknown one: the same status and message.
- Data requests are unchanged: their job checks `preview`, which is all they need.
