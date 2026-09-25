# A Soil Index variable names a Run, and refuses Filter criteria

`class-distribution` and `value-range` accept `variable: { type: 'soil-index', id: '<Soil Index Run id>' }`. The population is that Run's scored geometries. Each one belongs to the units containing its representative point. A Run counts as completed when its `soil_index` partition is attached, never by its pg-boss job, which expires. A Filter carrying any criteria is refused: it supplies only the area.

## Considered options

- **A Soil Index Type (`crea-index`):** rejected. Its Runs overlap, so the same field would be counted twice.
- **Computing the index inside the Run:** rejected. It brings ADR 0036's queue starvation back, and would give one score per unit, which is always 100% in one Class.
- **Ignoring Filter criteria:** rejected. They describe Observations and don't apply to scores, and silently ignoring an input breaks the rule that unused inputs are rejected.
- **Translating criteria** (a raster mask on points, dates mapped to `year`): deferred. Accepting a criterion later is additive.

## Consequences

- The Run id is the whole permission to read its scores, as in ADR 0037.
- Scores have no Dataset, Layer or Feature, so `dataset_ids` and `depth_ranges` are refused, rows carry no `dataset_id`/`n_features`, and a Value Range is request-wide only.
- Every unusable id gets one message, because telling the cases apart needs the job.
- The processor re-checks the partition, since a future delete of a Run would break requests that name it.
