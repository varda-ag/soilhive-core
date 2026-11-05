import { describe, it, expect } from '@jest/globals';
import { stageObservations, toDataRequestParameters } from '../../src/data-layer/DataRequests';
import { getEntityManager } from '../../src/utils/data-source';
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
} from '../../src/utils/mock';
import FilterService from '../../src/services/FilterService';
import { GISDataType } from '../../src/types/data';
import { RequestData } from '../../src/interfaces/RequestData';
import { DataRequestJob } from '../../src/interfaces/Job';
import { ClassMethod, CorrelationMeasure, DepthRanges, JobQueues, StatisticsType, ValueType, VariableType } from '../../src/types/enums';

// The one mapping from job data to what a caller reads back, shared by the row the processor writes
// and the response served while the job lives (docs/adr/0037).
describe('toDataRequestParameters', () => {
  const baseJob = (overrides: Partial<DataRequestJob> = {}): DataRequestJob =>
    ({
      type: JobQueues.DATA_REQUESTS,
      statistics_type: StatisticsType.DESCRIPTIVE,
      filter_id: '960ee487-a6bd-4da8-8ef0-da6ef23d0e80',
      created_by: 'someone@example.com',
      isDataAdmin: true,
      isSuperAdmin: true,
      anonymous: true,
      progress_percentage: 42,
      progress_description: 'Computing',
      ...overrides,
    }) as DataRequestJob;

  it('never carries the submitter, their privilege, or job bookkeeping', () => {
    const keys = Object.keys(toDataRequestParameters(baseJob()));
    for (const key of ['type', 'created_by', 'isDataAdmin', 'isSuperAdmin', 'anonymous', 'progress_percentage', 'progress_description']) {
      expect(keys).not.toContain(key);
    }
  });

  it('defaults the resolved half when no unit has been resolved yet', () => {
    expect(toDataRequestParameters(baseJob())).toEqual({
      statistics_type: StatisticsType.DESCRIPTIVE,
      filter_id: '960ee487-a6bd-4da8-8ef0-da6ef23d0e80',
      derived_filter_id: null,
      unit_count: 0,
      units: [],
    });
  });

  it('keeps every optional parameter that was given and the resolved units', () => {
    const units = [{ unit_id: 'u1', label: 'A', area_m2: 1, raster_filtered: false }] as unknown as DataRequestJob['units'];
    const result = toDataRequestParameters(
      baseJob({
        file_id: 'file-1',
        label_field: 'name',
        dataset_ids: ['ds-a'],
        variable: { type: VariableType.SOIL_PROPERTY, id: 'ph' },
        time_aggregation: 'none',
        derived_filter_id: 'derived-1',
        unit_count: 1,
        units,
      }),
    );
    expect(result).toEqual({
      statistics_type: StatisticsType.DESCRIPTIVE,
      filter_id: '960ee487-a6bd-4da8-8ef0-da6ef23d0e80',
      file_id: 'file-1',
      label_field: 'name',
      dataset_ids: ['ds-a'],
      variable: { type: VariableType.SOIL_PROPERTY, id: 'ph' },
      time_aggregation: 'none',
      derived_filter_id: 'derived-1',
      unit_count: 1,
      units,
    });
  });

  it('keeps a generated-classes request as submitted', () => {
    const result = toDataRequestParameters(
      baseJob({ statistics_type: StatisticsType.CLASS_DISTRIBUTION, class_count: 8, class_method: ClassMethod.QUANTILE }),
    );
    expect(result).toMatchObject({ class_count: 8, class_method: ClassMethod.QUANTILE });
    expect(result).not.toHaveProperty('classes');
  });

  it('keeps the class-distribution parameters, so the row says what the percentages are of', () => {
    const classes = [
      { name: 'Acid', max: 6.5 },
      { name: 'Alkaline', min: 6.5 },
    ];
    const result = toDataRequestParameters(
      baseJob({
        statistics_type: StatisticsType.CLASS_DISTRIBUTION,
        variable: { type: VariableType.SOIL_PROPERTY, id: 'ph' },
        classes,
        time_aggregation: 3,
        depth_ranges: DepthRanges.STANDARD,
        value_type: ValueType.COUNT,
      }),
    );
    expect(result).toMatchObject({
      statistics_type: StatisticsType.CLASS_DISTRIBUTION,
      variable: { type: VariableType.SOIL_PROPERTY, id: 'ph' },
      classes,
      time_aggregation: 3,
      depth_ranges: DepthRanges.STANDARD,
      value_type: ValueType.COUNT,
    });
  });
});

describe('toDataRequestParameters — correlation', () => {
  it('keeps both axes and the measure, so a reader can name the axes', () => {
    const result = toDataRequestParameters({
      type: JobQueues.DATA_REQUESTS,
      statistics_type: StatisticsType.CORRELATION,
      filter_id: 'f',
      variable_x: { type: VariableType.SOIL_PROPERTY, id: 'clay' },
      variable_y: { type: VariableType.SOIL_PROPERTY, id: 'soc' },
      measure: CorrelationMeasure.MEDIAN,
      depth_ranges: DepthRanges.STANDARD,
      time_aggregation: 3,
    } as DataRequestJob);
    expect(result).toMatchObject({
      variable_x: { type: VariableType.SOIL_PROPERTY, id: 'clay' },
      variable_y: { type: VariableType.SOIL_PROPERTY, id: 'soc' },
      measure: CorrelationMeasure.MEDIAN,
    });
  });
});

describe('stageObservations', () => {
  it('stages the Observations of every given Soil Property and of no other', async () => {
    const dataset = await addDataset('stage-two-ds', [-1, -1, 5, 5], GISDataType.POINT);
    const category = await addCategory('stage-two-cat');
    const [clay, soc, ph] = await Promise.all(
      ['stage-two-clay', 'stage-two-soc', 'stage-two-ph'].map(name => addSoilProperty(name, category.id)),
    );
    const [feature] = await addFeatures(GISDataType.POINT, [[1, 1]]);
    const layer = await addLayer(undefined, '2020', 0, 30, 'stage-two-h');
    const procedure = await addProcedure('stage-two-proc');
    for (const [property, value] of [
      [clay!, 1],
      [soc!, 2],
      [ph!, 3],
    ] as const) {
      const datasetLayer = await addDatasetLayer(dataset.id, layer.id, feature!.id, property.id);
      await addObservations([value], procedure.id, datasetLayer.id);
    }
    const entityManager = await getEntityManager();
    const { id: unitId } = await new FilterService().insertUserGeometry(
      { entityManager, entitlements: {} } as RequestData,
      getPolygonFromBbox([0, 0, 2, 2]),
    );

    const staged = await entityManager.transaction(async em => {
      await stageObservations(em, {
        filter: { geometryIds: [unitId], parameters: {}, area: 0 },
        unitIds: [unitId],
        datasetSlugs: [dataset.slug],
        soilPropertySlugs: [clay!.slug, soc!.slug],
        onPhase: async () => undefined,
        assertNotCancelled: async () => undefined,
      });
      return em.query('SELECT soil_property_slug, value FROM sst_obs ORDER BY value');
    });

    expect(staged).toEqual([
      { soil_property_slug: clay!.slug, value: 1 },
      { soil_property_slug: soc!.slug, value: 2 },
    ]);
  });
});
