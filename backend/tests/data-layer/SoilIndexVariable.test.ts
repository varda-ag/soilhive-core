import { describe, it, expect } from '@jest/globals';
import { v4 as uuidv4 } from 'uuid';
import { getEntityManager } from '../../src/utils/data-source';
import { getPolygonFromBbox } from '../../src/utils/geometry';
import { computeClassDistribution } from '../../src/data-layer/ClassDistribution';
import { computeValueRange } from '../../src/data-layer/ValueRange';
import { soilIndexRunExists, soilIndexRunType, writeSoilIndexRun } from '../../src/data-layer/SoilIndex';
import { SoilIndexFeature } from '../../src/jobs/soil-indexes/types';
import FilterService from '../../src/services/FilterService';
import { RequestData } from '../../src/interfaces/RequestData';
import { ClassMethod, DepthRanges, SoilIndexType, ValueType } from '../../src/types/enums';

const bboxUnit = async (bbox: number[]): Promise<string> => {
  const entityManager = await getEntityManager();
  const { id } = await new FilterService().insertUserGeometry({ entityManager, entitlements: {} } as RequestData, getPolygonFromBbox(bbox));
  return id;
};

const point = (lon: number, lat: number, value: number): SoilIndexFeature => ({
  type: 'Feature',
  id: uuidv4(),
  geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: { value },
});

const writeRun = async (features: SoilIndexFeature[]): Promise<string> => {
  const run = uuidv4();
  await writeSoilIndexRun(await getEntityManager(), run, SoilIndexType.CREA_INDEX, features);
  return run;
};

const distribute = async (run: string, unitIds: string[], overrides: Partial<Parameters<typeof computeClassDistribution>[1]> = {}) =>
  computeClassDistribution(await getEntityManager(), {
    filter: { geometryIds: unitIds, parameters: {}, area: 0 },
    unitIds,
    datasetSlugs: [],
    variable: { soilIndexRun: run },
    classSource: {
      classes: [
        { name: 'Low', max: 0.4 },
        { name: 'High', min: 0.4 },
      ],
    },
    timeAggregation: 1,
    depthRanges: DepthRanges.NONE,
    valueType: ValueType.COUNT,
    maxClassEntries: 1_000_000,
    workMem: '64MB',
    statementTimeoutMs: 120_000,
    ...overrides,
  });

describe('soil index runs as a variable', () => {
  it('recognises a completed Run by its partition, and reads its type from the rows', async () => {
    const run = await writeRun([point(1, 1, 0.5)]);
    const entityManager = await getEntityManager();

    expect(await soilIndexRunExists(entityManager, run)).toBe(true);
    expect(await soilIndexRunType(entityManager, run)).toBe(SoilIndexType.CREA_INDEX);
    expect(await soilIndexRunExists(entityManager, uuidv4())).toBe(false);
    expect(await soilIndexRunExists(entityManager, 'not-a-uuid')).toBe(false);
  });

  it('knows a Run that scored nothing, which has no type to report', async () => {
    const run = await writeRun([]);
    const entityManager = await getEntityManager();

    expect(await soilIndexRunExists(entityManager, run)).toBe(true);
    expect(await soilIndexRunType(entityManager, run)).toBeNull();
  });

  it('distributes the scores inside each unit, with no dataset or feature keys on the rows', async () => {
    const run = await writeRun([point(0.5, 0.5, 0.1), point(0.6, 0.6, 0.2), point(0.7, 0.7, 0.9), point(3.5, 3.5, 0.3)]);
    const unitA = await bboxUnit([0, 0, 2, 2]);
    const unitB = await bboxUnit([3, 3, 4, 4]);

    const { rows, observedMin, observedMax } = await distribute(run, [unitA, unitB]);

    const byUnit = new Map(rows.map(row => [row.unit_id, row]));
    expect(byUnit.get(unitA)).toEqual({
      unit_id: unitA,
      year_start: null,
      year_end: null,
      count: 3,
      classes: [
        { name: 'Low', value: 2 },
        { name: 'High', value: 1 },
      ],
    });
    expect(byUnit.get(unitB)!.count).toBe(1);
    expect(observedMin).toBe(0.1);
    expect(observedMax).toBe(0.9);
  });

  it('places a scored polygon in the unit holding its representative point, never in both', async () => {
    // Straddles x = 2; its interior point is at x = 1.8.
    const straddling = {
      ...point(0, 0, 0.7),
      geometry: getPolygonFromBbox([1.2, 0.2, 2.4, 1.0]),
    } as unknown as SoilIndexFeature;
    const run = await writeRun([straddling]);
    const west = await bboxUnit([0, 0, 2, 2]);
    const east = await bboxUnit([2, 0, 4, 2]);

    const { rows } = await distribute(run, [west, east]);

    expect(rows.map(row => row.unit_id)).toEqual([west]);
  });

  it('generates classes from the scores in scope, each counted once', async () => {
    const run = await writeRun([point(0.5, 0.5, 0.1), point(1.5, 1.5, 0.3), point(0.6, 0.6, 0.9)]);
    // 0.3 is in both units; counted once, the median is 0.3.
    const unitA = await bboxUnit([0, 0, 2, 2]);
    const unitB = await bboxUnit([1, 1, 3, 3]);

    const { classes } = await distribute(run, [unitA, unitB], { classSource: { method: ClassMethod.QUANTILE, count: 2 } });

    expect(classes).toEqual([
      { name: '< 0.3', max: 0.3 },
      { name: '≥ 0.3', min: 0.3 },
    ]);
  });

  it('measures the value range of the scores in scope', async () => {
    const run = await writeRun([point(0.5, 0.5, 0.12), point(1.5, 1.5, 0.97), point(10, 10, 5)]);
    const unitA = await bboxUnit([0, 0, 2, 2]);
    const unitB = await bboxUnit([1, 1, 3, 3]);

    const { overall } = await computeValueRange(await getEntityManager(), {
      filter: { geometryIds: [unitA, unitB], parameters: {}, area: 0 },
      unitIds: [unitA, unitB],
      datasetSlugs: [],
      variable: { soilIndexRun: run },
      workMem: '64MB',
      statementTimeoutMs: 120_000,
    });

    // (10, 10) is outside every unit.
    expect(overall).toMatchObject({ count: 2, min: 0.12, max: 0.97 });
  });
});
