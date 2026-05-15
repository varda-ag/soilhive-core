# DAI counts distinct dated layers, not observations, for the temporal signal

The DAI formula includes a temporal richness signal. We count `COUNT(DISTINCT layer.id) FILTER (WHERE layer.sampling_date IS NOT NULL)` per feature rather than counting rows in the `observations` table.

## Why

`sampling_date` lives on `Layer`, not on `Observation`. An observation has no date of its own — its date is inherited through `DatasetLayer → Layer`. Multiple observations share the same layer (and thus the same date). Counting distinct observations with a date would require joining the `observations` table (a large table) and would count individual measurement values rather than unique sampling events.

Counting distinct dated layers measures "how many times was this location sampled with a known date" — a more meaningful temporal richness signal, and avoids the costly join.

## Consequences

A feature with one layer and 100 observations on that layer contributes 1 to `num_dated_layers`, not 100. This is the intended behaviour.
