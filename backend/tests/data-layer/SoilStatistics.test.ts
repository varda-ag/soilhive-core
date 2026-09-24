import { describe, it, expect } from '@jest/globals';
import { v4 as uuidv4 } from 'uuid';
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
import { computeSoilStatistics, SoilStatisticsOptions } from '../../src/data-layer/SoilStatistics';
import { writeSoilIndexRun } from '../../src/data-layer/SoilIndex';
import FilterService from '../../src/services/FilterService';
import ProcedureEntity from '../../src/entities/Procedure';
import { GISDataType, VocabularyType } from '../../src/types/data';
import { FilterCriteria } from '../../src/interfaces/DatasetFilter';
import { RequestData } from '../../src/interfaces/RequestData';
import { DepthRanges, SoilIndexType } from '../../src/types/enums';

const DATASET_BBOX = [-1, -1, 5, 5];

const bboxUnit = async (bbox: number[]): Promise<string> => {
  const entityManager = await getEntityManager();
  const { id } = await new FilterService().insertUserGeometry({ entityManager, entitlements: {} } as RequestData, getPolygonFromBbox(bbox));
  return id;
};

type RunOptions = Pick<SoilStatisticsOptions, 'unitIds'> &
  Partial<Omit<SoilStatisticsOptions, 'filter'>> & { parameters?: FilterCriteria; soilPropertySlug?: string };

const run = async ({ parameters, soilPropertySlug, ...options }: RunOptions) =>
  computeSoilStatistics(await getEntityManager(), {
    filter: { geometryIds: options.unitIds, parameters: parameters ?? {}, area: 0 },
    datasetSlugs: [],
    variable: { soilPropertySlug: soilPropertySlug ?? '' },
    timeAggregation: 'none',
    depthRanges: DepthRanges.NONE,
    maxRows: 200_000,
    workMem: '64MB',
    statementTimeoutMs: 120_000,
    ...options,
  });

let fixtureCounter = 0;
const unique = (prefix: string) => `${prefix}-${fixtureCounter++}`;

/** One Feature per `sample`; each layer gets a unique horizon, as `layers` is deduplicated by content. */
const seed = async () => {
  const dataset = await addDataset(unique('ss-ds'), DATASET_BBOX, GISDataType.POINT);
  const category = await addCategory(unique('ss-cat'));
  const soilProperty = await addSoilProperty(unique('ss-ph'), category.id, 'pH');
  let pointCounter = 0;

  const sample = async (
    values: number[],
    layer: { samplingDate?: string; minDepth?: number; maxDepth?: number; horizon?: string } = {},
    options: { coordinates?: [number, number]; procedureId?: string; datasetId?: string } = {},
  ) => {
    const n = pointCounter++;
    const [feature] = await addFeatures(GISDataType.POINT, [options.coordinates ?? [0.5 + (n % 10) * 0.1, 0.5 + Math.floor(n / 10) * 0.1]]);
    const created = await addLayer(undefined, layer.samplingDate, layer.minDepth, layer.maxDepth, layer.horizon ?? unique('h'));
    const datasetLayer = await addDatasetLayer(options.datasetId ?? dataset.id, created.id, feature!.id, soilProperty.id);
    await addObservations(values, options.procedureId ?? (await addProcedure(unique('ss-proc'))).id, datasetLayer.id);
  };

  return { dataset, soilProperty, sample };
};

describe('computeSoilStatistics — figures', () => {
  it('computes every statistic exactly for values 1..10, and absent fields have no key', async () => {
    const { dataset, soilProperty, sample } = await seed();
    await sample([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const { results } = await run({ unitIds: [unitId], datasetSlugs: [dataset.slug], soilPropertySlug: soilProperty.slug });

    expect(results).toEqual([
      {
        dataset_id: dataset.slug,
        unit_id: unitId,
        n_observations: 10,
        n_features: 1,
        min: 1,
        p05: 1.45,
        p25: 3.25,
        median: 5.5,
        p75: 7.75,
        p95: 9.55,
        max: 10,
        mean: 5.5,
        stddev: 3.028,
        // IQR 4.5: fences at 3.25 - 6.75 and 7.75 + 6.75.
        lower_fence: -3.5,
        upper_fence: 14.5,
        n_outliers_low: 0,
        n_outliers_high: 0,
        whisker_low: 1,
        whisker_high: 10,
        horizons: [expect.any(String)],
      },
    ]);
  });

  it('counts values beyond the Tukey fences and ends the whiskers inside them', async () => {
    const { dataset, soilProperty, sample } = await seed();
    await sample([-20, 1, 2, 3, 4, 5, 6, 7, 8, 9, 100]);
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const [row] = (await run({ unitIds: [unitId], datasetSlugs: [dataset.slug], soilPropertySlug: soilProperty.slug })).results;

    // q1 = 2.5, q3 = 7.5: fences at -5 and 15.
    expect(row).toMatchObject({
      min: -20,
      max: 100,
      lower_fence: -5,
      upper_fence: 15,
      n_outliers_low: 1,
      n_outliers_high: 1,
      whisker_low: 1,
      whisker_high: 9,
    });
  });

  it('interpolates the median, and omits stddev below two values', async () => {
    const first = await seed();
    await first.sample([1, 2, 3, 10]);
    const second = await seed();
    await second.sample([7], {}, { coordinates: [1.5, 1.5] });
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const [interpolated] = (await run({ unitIds: [unitId], datasetSlugs: [first.dataset.slug], soilPropertySlug: first.soilProperty.slug }))
      .results;
    expect(interpolated!.median).toBe(2.5);

    const [lone] = (await run({ unitIds: [unitId], datasetSlugs: [second.dataset.slug], soilPropertySlug: second.soilProperty.slug }))
      .results;
    expect(lone!.n_observations).toBe(1);
    expect(lone).not.toHaveProperty('stddev');
  });

  it('reports the distinct laboratory methods and horizons mixed into a row', async () => {
    const { dataset, soilProperty, sample } = await seed();
    const dataSource = await getDataSource();
    const repo = dataSource.getRepository(ProcedureEntity);
    const walkley = await repo.save(
      repo.create({ laboratory_method_id: (await addVocabulary('Walkley-Black', VocabularyType.LABORATORY_METHOD)).id }),
    );
    const dumas = await repo.save(
      repo.create({ laboratory_method_id: (await addVocabulary('Dumas', VocabularyType.LABORATORY_METHOD)).id }),
    );
    await sample([1], { horizon: 'A' }, { procedureId: walkley.id });
    await sample([2], { horizon: 'B' }, { procedureId: dumas.id });
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const [row] = (await run({ unitIds: [unitId], datasetSlugs: [dataset.slug], soilPropertySlug: soilProperty.slug })).results;

    expect(row!.laboratory_methods?.sort()).toEqual(['Dumas', 'Walkley-Black']);
    expect(row!.horizons?.sort()).toEqual(['A', 'B']);
  });
});

describe('computeSoilStatistics — buckets', () => {
  it('buckets by Year Window, and pools every year with none', async () => {
    const { dataset, soilProperty, sample } = await seed();
    await sample([5], { samplingDate: '2016-04-01' });
    await sample([7], { samplingDate: '2018-09-01' });
    await sample([8], { samplingDate: '2019-05-01' });
    await sample([6]);
    const unitId = await bboxUnit([0, 0, 2, 2]);
    const base = { unitIds: [unitId], datasetSlugs: [dataset.slug], soilPropertySlug: soilProperty.slug };

    const windowed = await run({ ...base, timeAggregation: 3 });
    expect(windowed.results.map(row => [row.year_start, row.year_end, row.n_observations])).toEqual([
      [2016, 2018, 2],
      [2019, 2021, 1],
      [null, null, 1],
    ]);

    const pooled = await run(base);
    expect(pooled.results).toHaveLength(1);
    expect(pooled.results[0]!.n_observations).toBe(4);
    expect(pooled.results[0]).not.toHaveProperty('year_start');
  });

  it('sorts into Standard Depth Ranges by midpoint, reporting the span behind each row', async () => {
    const { dataset, soilProperty, sample } = await seed();
    await sample([5], { minDepth: 0, maxDepth: 30 });
    await sample([6], { minDepth: 30, maxDepth: 60 });
    await sample([7]);
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const { results } = await run({
      unitIds: [unitId],
      datasetSlugs: [dataset.slug],
      soilPropertySlug: soilProperty.slug,
      depthRanges: DepthRanges.STANDARD,
    });

    expect(results.map(row => [row.depth_start, row.depth_end, row.depth_min ?? null, row.depth_max ?? null])).toEqual([
      [15, 30, 0, 30],
      [30, 60, 30, 60],
      [null, null, null, null],
    ]);
  });
});

describe('computeSoilStatistics — scope', () => {
  it('counts a value in every overlapping unit, but once in overall', async () => {
    const { dataset, soilProperty, sample } = await seed();
    await sample([10], {}, { coordinates: [0.5, 0.5] });
    await sample([20], {}, { coordinates: [1.5, 1.5] });
    const unitA = await bboxUnit([0, 0, 2, 2]);
    const unitB = await bboxUnit([1, 1, 3, 3]);

    const { overall, results } = await run({ unitIds: [unitA, unitB], datasetSlugs: [dataset.slug], soilPropertySlug: soilProperty.slug });

    const byUnit = new Map(results.map(row => [row.unit_id, row]));
    expect(byUnit.get(unitA)!.n_observations).toBe(2);
    expect(byUnit.get(unitB)!.n_observations).toBe(1);
    expect(overall).toHaveLength(1);
    expect(overall[0]).not.toHaveProperty('unit_id');
    expect(overall[0]).toMatchObject({ dataset_id: dataset.slug, n_observations: 2, mean: 15 });
  });

  it('keeps Datasets apart, in results and in overall', async () => {
    const { dataset, soilProperty, sample } = await seed();
    const second = await addDataset(unique('ss-ds'), DATASET_BBOX, GISDataType.POINT);
    await sample([5, 6]);
    await sample([9], {}, { datasetId: second.id });
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const { overall, results } = await run({
      unitIds: [unitId],
      datasetSlugs: [dataset.slug, second.slug],
      soilPropertySlug: soilProperty.slug,
    });

    expect(results.map(row => row.dataset_id).sort()).toEqual([dataset.slug, second.slug].sort());
    expect(overall).toHaveLength(2);
  });

  it('honours the Filter soil property criterion', async () => {
    const { dataset, soilProperty, sample } = await seed();
    await sample([5]);
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const excluded = await run({
      unitIds: [unitId],
      datasetSlugs: [dataset.slug],
      soilPropertySlug: soilProperty.slug,
      parameters: { soil_properties: ['something-else'] },
    });

    expect(excluded).toEqual({ overall: [], results: [] });
  });

  it('fails before aggregating when overall + results rows exceed the budget', async () => {
    const { dataset, soilProperty, sample } = await seed();
    await sample([5], { samplingDate: '2016-01-01' });
    await sample([7], { samplingDate: '2017-01-01' });
    const unitId = await bboxUnit([0, 0, 2, 2]);
    const base = { unitIds: [unitId], datasetSlugs: [dataset.slug], soilPropertySlug: soilProperty.slug, timeAggregation: 1 };

    // Two results rows and two overall rows.
    await expect(run({ ...base, maxRows: 3 })).rejects.toMatchObject({
      code: 'DR_SOIL_STATISTICS_TOO_LARGE',
      params: { rows: 4, max_rows: 3 },
    });
    expect((await run({ ...base, maxRows: 4 })).results).toHaveLength(2);
  });

  it('summarises a Soil Index Run without Dataset, Feature or depth fields', async () => {
    const runId = uuidv4();
    await writeSoilIndexRun(await getEntityManager(), runId, SoilIndexType.CREA_INDEX, [
      { type: 'Feature', id: uuidv4(), geometry: { type: 'Point', coordinates: [0.5, 0.5] }, properties: { value: 0.2 } },
      { type: 'Feature', id: uuidv4(), geometry: { type: 'Point', coordinates: [0.6, 0.6] }, properties: { value: 0.4 } },
    ]);
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const { overall, results } = await run({ unitIds: [unitId], variable: { soilIndexRun: runId } });

    expect(results).toEqual([
      {
        unit_id: unitId,
        n_scores: 2,
        min: 0.2,
        p05: 0.21,
        p25: 0.25,
        median: 0.3,
        p75: 0.35,
        p95: 0.39,
        max: 0.4,
        mean: 0.3,
        stddev: 0.141,
        lower_fence: 0.1,
        upper_fence: 0.5,
        n_outliers_low: 0,
        n_outliers_high: 0,
        whisker_low: 0.2,
        whisker_high: 0.4,
      },
    ]);
    expect(overall[0]).not.toHaveProperty('dataset_id');
  });
});
