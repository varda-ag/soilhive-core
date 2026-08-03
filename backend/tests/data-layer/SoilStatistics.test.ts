import { describe, it, expect } from '@jest/globals';
import * as turf from '@turf/turf';
import { Polygon } from 'geojson';
import { getDataSource, getEntityManager } from '../../src/utils/data-source';
import { getPolygonFromBbox } from '../../src/utils/geometry';
import {
  addCategory,
  addDataset,
  addDatasetLayer,
  addFeatures,
  addLayer,
  addObservations,
  addProcedure,
  addSoilProperty,
  addVocabulary,
} from '../../src/utils/mock';
import { computeSoilStatistics } from '../../src/data-layer/SoilStatistics';
import FilterService from '../../src/services/FilterService';
import ProcedureEntity from '../../src/entities/Procedure';
import { GISDataType, VocabularyType } from '../../src/types/data';
import { DataFilter, FilterCriteria } from '../../src/interfaces/DatasetFilter';
import { RequestData } from '../../src/interfaces/RequestData';

const DATASET_BBOX = [-1, -1, 5, 5];

/**
 * Units go in through the real insertUserGeometry, so canonicalisation, geom_hash dedup
 * and the ST_Subdivide trigger all behave exactly as they do in the job.
 */
const addUnit = async (geometry: Polygon): Promise<string> => {
  const entityManager = await getEntityManager();
  const { id } = await new FilterService().insertUserGeometry({ entityManager, entitlements: {} } as RequestData, geometry);
  return id;
};

const bboxUnit = (bbox: number[]) => addUnit(getPolygonFromBbox(bbox));

/** addProcedure only sets a sample pretreatment; laboratory method has to be added here. */
const addProcedureWithLabMethod = async (methodName: string): Promise<string> => {
  const method = await addVocabulary(methodName, VocabularyType.LABORATORY_METHOD);
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository(ProcedureEntity);
  const saved = await repo.save(repo.create({ laboratory_method_id: method.id }));
  return saved.id;
};

/**
 * Observations are unique on (dataset_layer_id, value, procedure_id), so a repeated value
 * on one DatasetLayer can only exist under a different procedure — which is exactly how
 * real data carries it (the same value measured twice).
 *
 * Values are batched by how often they have already been seen: all first occurrences go in
 * under one procedure in a single insert, all second occurrences under the next, and so
 * on. A set of distinct values therefore costs one round trip however large it is, which
 * matters now that the histogram fixtures seed a hundred at a time.
 *
 * Each procedure needs its own sample pretreatment: `procedures` is UNIQUE NULLS NOT
 * DISTINCT across every vocabulary column, so two all-null procedures collide.
 */
let procedureCounter = 0;
const addObservationsWithRepeats = async (values: number[], datasetLayerId: string): Promise<void> => {
  const timesSeen = new Map<number, number>();
  const batches: number[][] = [];
  for (const value of values) {
    const rank = timesSeen.get(value) ?? 0;
    timesSeen.set(value, rank + 1);
    (batches[rank] ??= []).push(value);
  }
  for (const batch of batches) {
    const procedure = await addProcedure(`repeat-proc-${procedureCounter++}`);
    await addObservations(batch, procedure.id, datasetLayerId);
  }
};

/**
 * 101 values — one more than MIN_HISTOGRAM_COUNT, so a histogram is emitted — spanning
 * 0..100 so that ten bins are exactly 10 wide and every bin count is predictable.
 */
const OVER_THRESHOLD = Array.from({ length: 101 }, (_, i) => i);

const runStatistics = async (unitIds: string[], datasetSlugs: string[], parameters: FilterCriteria = {}, histogramBins = 10) => {
  const entityManager = await getEntityManager();
  const filter: DataFilter = { geometryIds: unitIds, parameters, area: 0 };
  return computeSoilStatistics(entityManager, {
    filter,
    unitIds,
    datasetSlugs,
    histogramBins,
    maxCells: 200_000,
    workMem: '64MB',
    statementTimeoutMs: 120_000,
  });
};

/**
 * One dataset, one soil property, one layer, one Feature — the minimal fixture for
 * asserting metric values exactly.
 */
const seedSingleGroup = async (
  values: number[],
  options: { lng?: number; lat?: number; samplingDate?: string; minDepth?: number; maxDepth?: number; horizon?: string } = {},
) => {
  const dataset = await addDataset(`ds-${Math.random().toString(36).slice(2, 8)}`, DATASET_BBOX, GISDataType.POINT);
  const category = await addCategory(`cat-${Math.random().toString(36).slice(2, 8)}`);
  const soilProperty = await addSoilProperty(`ph-${Math.random().toString(36).slice(2, 8)}`, category.id, 'pH');
  const [feature] = await addFeatures(GISDataType.POINT, [[options.lng ?? 1, options.lat ?? 1]]);
  const layer = await addLayer(undefined, options.samplingDate, options.minDepth, options.maxDepth, options.horizon);
  const datasetLayer = await addDatasetLayer(dataset.id, layer.id, feature.id, soilProperty.id);
  // Repeat-tolerant on purpose: several of these fixtures need duplicate values.
  await addObservationsWithRepeats(values, datasetLayer.id);
  return { dataset, soilProperty, feature };
};

describe('computeSoilStatistics — metric correctness', () => {
  it('computes every statistic exactly for values 1..10', async () => {
    const { dataset, soilProperty } = await seedSingleGroup([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const { results } = await runStatistics([unitId], [dataset.slug]);

    expect(results).toHaveLength(1);
    const group = results[0]!;
    expect(group.dataset_id).toBe(dataset.slug);
    expect(group.soil_property).toBe(soilProperty.slug);
    expect(group.standard_unit).toBe('pH');

    const cell = group.overall;
    expect(cell.count).toBe(10);
    expect(cell.n_features).toBe(1);
    expect(cell.n_layers).toBe(1);
    expect(cell.min).toBe(1);
    expect(cell.max).toBe(10);
    expect(cell.mean).toBe(5.5);
    expect(cell.median).toBe(5.5);
    // Every statistic is rounded to 3 decimals on the way out: 3.02765035409749 would
    // otherwise carry 15 digits into the job's jsonb for no gain in meaning.
    expect(cell.stddev).toBe(3.028);
    expect(cell.p05).toBe(1.45);
    expect(cell.p25).toBe(3.25);
    expect(cell.p75).toBe(7.75);
    expect(cell.p95).toBe(9.55);

    // Fields with nothing to report are absent rather than null or []: this fixture has
    // no sampling date, no depths, no horizon and no laboratory method. Asserted as
    // missing keys, since `toBeUndefined` would also pass on `{ horizons: undefined }`.
    for (const key of ['sampling_date_min', 'sampling_date_max', 'depth_min', 'depth_max', 'horizons', 'laboratory_methods']) {
      expect(cell).not.toHaveProperty(key);
    }
    // Ten observations is below the histogram threshold, so no bins are emitted; the
    // boundaries a consumer would derive from them are gone with it.
    expect(cell).not.toHaveProperty('histogram');
  });

  it('interpolates the median rather than picking an observed value', async () => {
    // percentile_cont(0.5) over [1,2,3,10] is 2.5; percentile_disc would return 2.
    // This asserts the interpolating variant is used and fails if it is ever swapped.
    const { dataset } = await seedSingleGroup([1, 2, 3, 10]);
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const { results } = await runStatistics([unitId], [dataset.slug]);

    const cell = results[0]!.overall;
    expect(cell.median).toBe(2.5);
    expect(cell.median).not.toBe(2);
    expect(cell.mean).toBe(4);
    expect(cell.p25).toBe(1.75);
    expect(cell.p75).toBe(4.75);
  });

  it('reports a lone observation without a standard deviation', async () => {
    const { dataset } = await seedSingleGroup([7]);
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const { results } = await runStatistics([unitId], [dataset.slug]);

    const cell = results[0]!.overall;
    expect(cell.count).toBe(1);
    expect(cell.min).toBe(7);
    expect(cell.max).toBe(7);
    expect(cell.median).toBe(7);
    // Undefined for count < 2, and absent from the payload rather than null.
    expect(cell).not.toHaveProperty('stddev');
  });
});

describe('computeSoilStatistics — histogram', () => {
  it('bins every value and clamps the maximum into the top bin', async () => {
    const { dataset } = await seedSingleGroup(OVER_THRESHOLD);
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const { results } = await runStatistics([unitId], [dataset.slug]);

    const { histogram, count } = results[0]!.overall;
    expect(count).toBe(101);
    // 0..100 over ten bins: ten values each, except the top bin which also takes the
    // maximum. That last 11 is the assertion that matters — unclamped, width_bucket puts
    // the maximum in a non-existent 11th bin and it vanishes from the counts while
    // `count` still reports it.
    expect(histogram!.bin_width).toBe(10);
    expect(histogram!.counts).toEqual([10, 10, 10, 10, 10, 10, 10, 10, 10, 11]);
    expect(histogram!.counts.reduce((a, b) => a + b, 0)).toBe(count);
  });

  it('honours a custom bin count, rounding the resulting width', async () => {
    const { dataset } = await seedSingleGroup(OVER_THRESHOLD);
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const { results } = await runStatistics([unitId], [dataset.slug], {}, 3);

    const { histogram } = results[0]!.overall;
    expect(histogram!.counts).toEqual([34, 33, 34]);
    // 100 / 3 = 33.333333333333336 before rounding.
    expect(histogram!.bin_width).toBe(33.333);
    expect(histogram!.counts.reduce((a, b) => a + b, 0)).toBe(101);
  });

  it('emits a single zero-width bin when every value is identical', async () => {
    const { dataset } = await seedSingleGroup(Array.from({ length: 101 }, () => 5));
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const { results } = await runStatistics([unitId], [dataset.slug]);

    const cell = results[0]!.overall;
    expect(cell.count).toBe(101);
    expect(cell.min).toBe(5);
    expect(cell.max).toBe(5);
    expect(cell.stddev).toBe(0);
    // A single bin — not bin_width 0 — is the reliable signal for this case, since a
    // genuine width under 0.0005 also rounds to 0.
    expect(cell.histogram).toEqual({ bin_width: 0, counts: [101] });
  });

  it('omits the histogram for a cell at the count threshold and emits it one above', async () => {
    // The threshold is enforced in SQL, so this also asserts the bin rows for a small
    // cell are never fetched: an off-by-one there would surface as an empty counts array
    // rather than as an absent histogram.
    // The two fixtures need distinct depths as well as distinct locations: `layers` is
    // UNIQUE NULLS NOT DISTINCT on (license, sampling_date, min_depth, max_depth, horizon),
    // so two layers left entirely unset are the same row.
    const { dataset: atThreshold } = await seedSingleGroup(OVER_THRESHOLD.slice(0, 100), { minDepth: 0, maxDepth: 30 });
    const { dataset: aboveThreshold } = await seedSingleGroup(OVER_THRESHOLD, { lng: 1.5, lat: 1.5, minDepth: 30, maxDepth: 60 });
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const { results } = await runStatistics([unitId], [atThreshold.slug, aboveThreshold.slug]);

    const at = results.find(group => group.dataset_id === atThreshold.slug)!.overall;
    const above = results.find(group => group.dataset_id === aboveThreshold.slug)!.overall;
    expect(at.count).toBe(100);
    expect(at).not.toHaveProperty('histogram');
    expect(above.count).toBe(101);
    expect(above.histogram!.counts).toHaveLength(10);
  });
});

describe('computeSoilStatistics — time and depth breakdown', () => {
  it('keeps undated and undepthed layers in their own buckets', async () => {
    const dataset = await addDataset('breakdown-ds', DATASET_BBOX, GISDataType.POINT);
    const category = await addCategory('breakdown-cat');
    const soilProperty = await addSoilProperty('breakdown-prop', category.id, 'mg/kg');
    const [feature] = await addFeatures(GISDataType.POINT, [[1, 1]]);
    const procedure = await addProcedure('breakdown-proc');

    const layers = [
      { sampling_date: '2019-05-01', min_depth: 0, max_depth: 30, values: [1, 3] },
      { sampling_date: '2020-05-01', min_depth: 0, max_depth: 30, values: [5] },
      { sampling_date: undefined, min_depth: 0, max_depth: 30, values: [7] },
      { sampling_date: '2019-05-01', min_depth: undefined, max_depth: undefined, values: [9] },
    ];
    for (const spec of layers) {
      const layer = await addLayer(undefined, spec.sampling_date, spec.min_depth, spec.max_depth);
      const datasetLayer = await addDatasetLayer(dataset.id, layer.id, feature.id, soilProperty.id);
      await addObservations(spec.values, procedure.id, datasetLayer.id);
    }

    const unitId = await bboxUnit([0, 0, 2, 2]);
    const { results, truncated } = await runStatistics([unitId], [dataset.slug]);

    expect(truncated).toBe(false);
    const group = results[0]!;
    expect(group.l4_included).toBe(true);
    expect(group.overall.count).toBe(5);

    const breakdown = group.units[0]!.breakdown!;
    expect(breakdown).toHaveLength(4);

    const dated2019 = breakdown.find(cell => cell.year === 2019 && cell.min_depth === 0)!;
    expect(dated2019.count).toBe(2);
    expect(dated2019.mean).toBe(2);
    // The depth aggregates are the cell's own group key, so they are not repeated — while
    // the keys themselves stay, null included, because there a null identifies the bucket.
    expect(dated2019).not.toHaveProperty('depth_min');
    expect(dated2019).not.toHaveProperty('depth_max');
    expect(dated2019.max_depth).toBe(30);

    // Null year and null depth are distinct buckets, never merged into a neighbour.
    expect(breakdown.filter(cell => cell.year === null)).toHaveLength(1);
    expect(breakdown.find(cell => cell.year === null)!.count).toBe(1);
    expect(breakdown.filter(cell => cell.min_depth === null && cell.max_depth === null)).toHaveLength(1);
    expect(breakdown.find(cell => cell.min_depth === null)!.year).toBe(2019);
  });

  it('keeps depth intervals whose digits concatenate identically in separate cells', async () => {
    // 1-530cm and 15-30cm both render as "20191530" once year and depths are joined
    // without a separator, which would merge the two cells' histograms into one.
    const dataset = await addDataset('keycollide-ds', DATASET_BBOX, GISDataType.POINT);
    const category = await addCategory('keycollide-cat');
    const soilProperty = await addSoilProperty('keycollide-prop', category.id, 'mg/kg');
    const [feature] = await addFeatures(GISDataType.POINT, [[1, 1]]);
    const procedure = await addProcedure('keycollide-proc');

    const wide = await addLayer(undefined, '2019-01-01', 1, 530);
    const narrow = await addLayer(undefined, '2019-01-01', 15, 30);
    const dlWide = await addDatasetLayer(dataset.id, wide.id, feature.id, soilProperty.id);
    const dlNarrow = await addDatasetLayer(dataset.id, narrow.id, feature.id, soilProperty.id);
    // Both cells must be non-degenerate, carry a histogram at all (so both clear the count
    // threshold) and hold a DIFFERENT number of observations, or a shared histogram map
    // would go unnoticed: a cell whose values are all identical builds its single bin
    // without consulting the map, and two cells with the same bin pattern overwrite each
    // other with equal values.
    await addObservations(
      Array.from({ length: 101 }, (_, i) => i),
      procedure.id,
      dlWide.id,
    );
    await addObservations(
      Array.from({ length: 150 }, (_, i) => 1000 + i),
      procedure.id,
      dlNarrow.id,
    );

    const unitId = await bboxUnit([0, 0, 2, 2]);
    const { results } = await runStatistics([unitId], [dataset.slug]);

    const breakdown = results[0]!.units[0]!.breakdown!;
    expect(breakdown).toHaveLength(2);

    const wideCell = breakdown.find(cell => cell.min_depth === 1 && cell.max_depth === 530)!;
    const narrowCell = breakdown.find(cell => cell.min_depth === 15 && cell.max_depth === 30)!;
    expect(wideCell.count).toBe(101);
    expect(wideCell.max).toBe(100);
    expect(narrowCell.count).toBe(150);
    expect(narrowCell.max).toBe(1149);
    // Each cell's bin counts must sum to its own count, not to the other's.
    expect(wideCell.histogram!.counts.reduce((a, b) => a + b, 0)).toBe(101);
    expect(narrowCell.histogram!.counts.reduce((a, b) => a + b, 0)).toBe(150);
  });

  it('drops a group breakdown whole when the cell budget is exceeded, keeping its headline cell', async () => {
    const dataset = await addDataset('truncate-ds', DATASET_BBOX, GISDataType.POINT);
    const category = await addCategory('truncate-cat');
    const soilProperty = await addSoilProperty('truncate-prop', category.id, 'mg/kg');
    const [feature] = await addFeatures(GISDataType.POINT, [[1, 1]]);
    const procedure = await addProcedure('truncate-proc');

    for (const year of ['2018-01-01', '2019-01-01', '2020-01-01']) {
      const layer = await addLayer(undefined, year, 0, 30);
      const datasetLayer = await addDatasetLayer(dataset.id, layer.id, feature.id, soilProperty.id);
      await addObservations([1, 2], procedure.id, datasetLayer.id);
    }

    const unitId = await bboxUnit([0, 0, 2, 2]);
    const entityManager = await getEntityManager();
    const { results, truncated } = await computeSoilStatistics(entityManager, {
      filter: { geometryIds: [unitId], parameters: {}, area: 0 },
      unitIds: [unitId],
      datasetSlugs: [dataset.slug],
      histogramBins: 10,
      maxCells: 2, // three (year, depth) cells exist, so the group cannot fit
      workMem: '64MB',
      statementTimeoutMs: 120_000,
    });

    expect(truncated).toBe(true);
    const group = results[0]!;
    expect(group.l4_included).toBe(false);
    // Absent rather than empty; `l4_included` is what says the detail was withheld rather
    // than merely redundant.
    expect(group.units[0]!).not.toHaveProperty('breakdown');
    // The headline numbers survive intact — only the finer level degrades.
    expect(group.overall.count).toBe(6);
    expect(group.units[0]!.count).toBe(6);
  });

  it('omits a breakdown whose single cell would repeat the unit cell', async () => {
    // Two layers sampled on different days of the same year at the same depth interval:
    // the breakdown groups by year, so both collapse into a single cell covering exactly
    // the unit's own Observations. n_layers is 2 here on purpose — the redundancy is a
    // property of the cell count, not the layer count, and a rule keyed on one layer would
    // miss this. The dates must differ for a second reason too: `layers` is UNIQUE NULLS
    // NOT DISTINCT on (license, sampling_date, min_depth, max_depth, horizon).
    const dataset = await addDataset('single-cell-ds', DATASET_BBOX, GISDataType.POINT);
    const category = await addCategory('single-cell-cat');
    const soilProperty = await addSoilProperty('single-cell-prop', category.id, 'mg/kg');
    const [feature] = await addFeatures(GISDataType.POINT, [[1, 1]]);
    const procedure = await addProcedure('single-cell-proc');

    for (const [samplingDate, values] of [
      ['2021-06-01', [1, 2]],
      ['2021-07-15', [3, 4]],
    ] as [string, number[]][]) {
      const layer = await addLayer(undefined, samplingDate, 0, 30);
      const datasetLayer = await addDatasetLayer(dataset.id, layer.id, feature.id, soilProperty.id);
      await addObservations(values, procedure.id, datasetLayer.id);
    }

    const unitId = await bboxUnit([0, 0, 2, 2]);
    const { results, truncated } = await runStatistics([unitId], [dataset.slug]);

    const group = results[0]!;
    // Nothing was dropped for budget reasons, which is how a reader tells this case from
    // the truncated one above.
    expect(truncated).toBe(false);
    expect(group.l4_included).toBe(true);

    const unit = group.units[0]!;
    expect(unit.n_layers).toBe(2);
    expect(unit.count).toBe(4);
    expect(unit).not.toHaveProperty('breakdown');
    // The omitted cell's own keys stay recoverable from the unit cell: the depths directly,
    // and year 2021 from the first four characters of the earliest sampling date.
    expect(unit.depth_min).toBe(0);
    expect(unit.depth_max).toBe(30);
    expect(unit.sampling_date_min).toBe('2021-06-01');
    expect(unit.sampling_date_max).toBe('2021-07-15');
  });
});

describe('computeSoilStatistics — spatial semantics', () => {
  it('counts a shared Feature in both overlapping units but once overall', async () => {
    const dataset = await addDataset('overlap-ds', DATASET_BBOX, GISDataType.POINT);
    const category = await addCategory('overlap-cat');
    const soilProperty = await addSoilProperty('overlap-prop', category.id, 'mg/kg');
    const procedure = await addProcedure('overlap-proc');
    const layer = await addLayer(undefined, '2020-01-01', 0, 30);

    // (0.5, 0.5) is inside unit A only; (1.5, 1.5) is inside both.
    const [onlyInA, inBoth] = await addFeatures(GISDataType.POINT, [
      [0.5, 0.5],
      [1.5, 1.5],
    ]);
    const dlA = await addDatasetLayer(dataset.id, layer.id, onlyInA.id, soilProperty.id);
    const dlBoth = await addDatasetLayer(dataset.id, layer.id, inBoth.id, soilProperty.id);
    await addObservations([10], procedure.id, dlA.id);
    await addObservations([20], procedure.id, dlBoth.id);

    const unitA = await bboxUnit([0, 0, 2, 2]);
    const unitB = await bboxUnit([1, 1, 3, 3]);

    const { results } = await runStatistics([unitA, unitB], [dataset.slug]);

    const group = results[0]!;
    const byUnit = new Map(group.units.map(unit => [unit.unit_id, unit]));
    expect(byUnit.get(unitA)!.count).toBe(2);
    expect(byUnit.get(unitA)!.mean).toBe(15);
    expect(byUnit.get(unitB)!.count).toBe(1);
    expect(byUnit.get(unitB)!.mean).toBe(20);

    // Overall de-duplicates, so it is NOT the sum of the per-unit counts (2 + 1).
    expect(group.overall.count).toBe(2);
    expect(group.overall.mean).toBe(15);
  });

  it('does not multiply Observations across the subdivision pieces of one unit', async () => {
    const dataset = await addDataset('subdiv-ds', DATASET_BBOX, GISDataType.POINT);
    const category = await addCategory('subdiv-cat');
    const soilProperty = await addSoilProperty('subdiv-prop', category.id, 'mg/kg');
    const procedure = await addProcedure('subdiv-proc');
    const layer = await addLayer(undefined, '2020-01-01', 0, 30);

    // A polygonal Feature wide enough to straddle several subdivision pieces.
    const [feature] = await addFeatures(GISDataType.POLYGONAL, [getPolygonFromBbox([1, 1, 3, 3]).coordinates]);
    const datasetLayer = await addDatasetLayer(dataset.id, layer.id, feature.id, soilProperty.id);
    await addObservations([4, 6], procedure.id, datasetLayer.id);

    // 256 vertices puts this well past the 64-vertex ST_Subdivide threshold.
    const circle = turf.circle([2, 2], 200, { steps: 256, units: 'kilometers' });
    const unitId = await addUnit(circle.geometry as Polygon);

    const entityManager = await getEntityManager();
    const [{ pieces }] = await entityManager.query(
      'SELECT COUNT(*)::int AS pieces FROM user_geometry_subdivisions WHERE user_geometry_id = $1',
      [unitId],
    );
    expect(pieces).toBeGreaterThan(1);

    const { results } = await runStatistics([unitId], [dataset.slug]);

    const group = results[0]!;
    expect(group.overall.count).toBe(2);
    expect(group.overall.n_features).toBe(1);
    expect(group.units[0]!.count).toBe(2);
    expect(group.units[0]!.mean).toBe(5);
  });

  it('returns nothing when no unit intersects any Feature', async () => {
    const { dataset } = await seedSingleGroup([1, 2, 3]);
    const farAway = await bboxUnit([40, 40, 41, 41]);

    const { results, truncated } = await runStatistics([farAway], [dataset.slug]);

    expect(results).toEqual([]);
    expect(truncated).toBe(false);
  });
});

describe('computeSoilStatistics — filtering', () => {
  it('excludes datasets that are not published and applies the visibility criterion', async () => {
    const { dataset } = await seedSingleGroup([1, 2, 3]);
    const unitId = await bboxUnit([0, 0, 2, 2]);
    const entityManager = await getEntityManager();

    // Coverage applies status and visibility; the /soil-data path does not. This asserts
    // the statistics job follows coverage.
    await entityManager.query('UPDATE datasets SET status = $1 WHERE id = $2', ['ONGOING', dataset.id]);
    expect((await runStatistics([unitId], [dataset.slug])).results).toEqual([]);

    await entityManager.query('UPDATE datasets SET status = $1 WHERE id = $2', ['PUBLISHED', dataset.id]);
    expect((await runStatistics([unitId], [dataset.slug])).results).toHaveLength(1);

    expect((await runStatistics([unitId], [dataset.slug], { visibility: 'private' })).results).toEqual([]);
    expect((await runStatistics([unitId], [dataset.slug], { visibility: 'public' })).results).toHaveLength(1);
  });

  it('applies depth, date and soil property criteria', async () => {
    const dataset = await addDataset('criteria-ds', DATASET_BBOX, GISDataType.POINT);
    const category = await addCategory('criteria-cat');
    const wanted = await addSoilProperty('criteria-wanted', category.id, 'mg/kg');
    const other = await addSoilProperty('criteria-other', category.id, 'mg/kg');
    const procedure = await addProcedure('criteria-proc');
    const [feature] = await addFeatures(GISDataType.POINT, [[1, 1]]);

    const shallow = await addLayer(undefined, '2019-01-01', 0, 30);
    const deep = await addLayer(undefined, '2021-01-01', 60, 100);
    const dlShallow = await addDatasetLayer(dataset.id, shallow.id, feature.id, wanted.id);
    const dlDeep = await addDatasetLayer(dataset.id, deep.id, feature.id, wanted.id);
    const dlOther = await addDatasetLayer(dataset.id, shallow.id, feature.id, other.id);
    await addObservations([1], procedure.id, dlShallow.id);
    await addObservations([2], procedure.id, dlDeep.id);
    await addObservations([3], procedure.id, dlOther.id);

    // The depth and date criteria carry a dataset-level predicate as well as a layer-level
    // one — `(soil_depth->>'max')::int >= min_depth`, `reference_period_stop >= …` — so a
    // dataset with NULL rollup metadata is filtered out entirely, whatever its layers say.
    // That is coverage's behaviour, which this job follows, so the fixture must set them.
    const entityManager = await getEntityManager();
    await entityManager.query(
      `UPDATE datasets
       SET soil_depth = $1::jsonb, reference_period_start = $2, reference_period_stop = $3
       WHERE id = $4`,
      [JSON.stringify({ min: 0, max: 100 }), '2019-01-01', '2021-01-01', dataset.id],
    );

    const unitId = await bboxUnit([0, 0, 2, 2]);

    const unfiltered = await runStatistics([unitId], [dataset.slug]);
    expect(unfiltered.results).toHaveLength(2);

    const byProperty = await runStatistics([unitId], [dataset.slug], { soil_properties: [wanted.slug] });
    expect(byProperty.results).toHaveLength(1);
    expect(byProperty.results[0]!.overall.count).toBe(2);

    const byDepth = await runStatistics([unitId], [dataset.slug], { soil_properties: [wanted.slug], min_depth: 0, max_depth: 30 });
    expect(byDepth.results[0]!.overall.count).toBe(1);
    expect(byDepth.results[0]!.overall.min).toBe(1);

    const byDate = await runStatistics([unitId], [dataset.slug], {
      soil_properties: [wanted.slug],
      min_sampling_date: '2020-01-01',
    });
    expect(byDate.results[0]!.overall.count).toBe(1);
    expect(byDate.results[0]!.overall.min).toBe(2);
  });

  it('reports the distinct laboratory methods mixed into a cell', async () => {
    const dataset = await addDataset('methods-ds', DATASET_BBOX, GISDataType.POINT);
    const category = await addCategory('methods-cat');
    const soilProperty = await addSoilProperty('methods-prop', category.id, 'mg/kg');
    const [feature] = await addFeatures(GISDataType.POINT, [[1, 1]]);
    const layer = await addLayer(undefined, '2020-01-01', 0, 30, 'A');
    const datasetLayer = await addDatasetLayer(dataset.id, layer.id, feature.id, soilProperty.id);

    // Two Observations on one DatasetLayer measured by different methods — permitted by
    // the (dataset_layer_id, value, procedure_id) uniqueness — so one mean spans both.
    const procedureOne = await addProcedureWithLabMethod('Walkley-Black');
    const procedureTwo = await addProcedureWithLabMethod('Dumas combustion');
    await addObservations([1], procedureOne, datasetLayer.id);
    await addObservations([2], procedureTwo, datasetLayer.id);

    const unitId = await bboxUnit([0, 0, 2, 2]);
    const { results } = await runStatistics([unitId], [dataset.slug]);

    const cell = results[0]!.overall;
    expect(cell.count).toBe(2);
    expect(cell.horizons).toEqual(['A']);
    // Two analytical methods behind one mean — the flag that makes it reviewable.
    expect(cell.laboratory_methods.sort()).toEqual(['Dumas combustion', 'Walkley-Black']);
  });
});
