# Filter criteria are entitlement-agnostic

The `visibility` Filter criterion (SP-5436) matches Datasets by their `visibility` attribute alone: `private` returns *all* private Datasets, not "private Datasets the caller is entitled to". More generally, no Filter criterion may depend on who is asking — discovery is open, and entitlements gate capabilities (preview/download) on the results, not membership in them.

## Considered options

- **Attribute filter (chosen).** Filter results stay user-independent, which two existing mechanisms depend on: content-identity dedup of Filters (ADR 0007) shares one stored Filter across equivalent submissions per owner, and the TTL query cache (ADR 0008) shares query results across requests without a per-user key. It also matches existing behaviour: private Datasets have always appeared in filter results for everyone.
- **Entitlement-aware filter (rejected).** `private` meaning "private and accessible to me" would make the same Filter return different results per user, requiring a per-user cache key (or cache bypass) on every filtering path and breaking the assumption that a Filter's results are a function of its content identity. If "my accessible datasets" filtering is ever needed, it should be a separate, explicitly user-scoped mechanism — not a Filter criterion.

## Consequences

- Any future criterion proposal must pass the same test: results must be derivable from the Filter's content alone.
- The DAI honours `visibility` via the live path: `visibility` joins the filtering keys in `isPrecomputableDaiParameters`, so Filters that set it skip the precomputed `feature_dai_stats` fast path (ADR 0009). Splitting the precomputed stats by visibility was deferred until usage justifies it.
