import { EntityManager } from 'typeorm';
import { DataFilter } from '../interfaces/DatasetFilter';
import { GISDataType } from '../types/data';
import { buildObservationCriteria, buildRasterSql, getEnabledRasterFilterTables, hasRasterFilters } from './SoilDataStorage';
import { DataRequestOutput } from '../jobs/data-requests/types';
import DataRequestEntity from '../entities/DataRequest';
import { DataRequestStatus, JobQueues } from '../types/enums';
import { PG_BOSS_SCHEMA } from '../services/PgBoss';
import { DataRequestParameters } from '../interfaces/DataRequest';
import { DataRequestJob } from '../interfaces/Job';

/** One row per Observation (or score), before any fan-out across units. */
const SST_OBS_DDL = `CREATE TEMP TABLE sst_obs (
    feature_id uuid NOT NULL,
    layer_id uuid NOT NULL,
    dataset_slug text NOT NULL,
    soil_property_slug text NOT NULL,
    standard_unit text,
    year int,
    min_depth int,
    max_depth int,
    horizon text,
    sampling_date text,
    laboratory_method text,
    value double precision NOT NULL
  ) ON COMMIT DROP`;

export interface StageObservationsOptions {
  filter: DataFilter;
  /** UserGeometry ids that are the Aggregation Units. */
  unitIds: string[];
  /** Dataset slugs to aggregate: already entitlement-filtered and raster-free. */
  datasetSlugs: string[];
  /** Narrows to one Soil Property, in addition to the Filter's own criteria. */
  soilPropertySlug?: string;
  onPhase: (description: string, percentage: number) => Promise<void>;
  assertNotCancelled: () => Promise<void>;
}

/** Fills `sst_unit_features` and `sst_obs`. Must run inside the caller's transaction (ON COMMIT DROP). */
export const stageObservations = async (
  em: EntityManager,
  options: StageObservationsOptions,
): Promise<{ usesMatchingFeatures: boolean }> => {
  const { filter, unitIds, datasetSlugs, soilPropertySlug } = options;
  const schema = process.env.POSTGRES_SCHEMA;
  const progress = options.onPhase;
  const checkCancelled = options.assertNotCancelled;

  // ── stage 1: units → Features ────────────────────────────────────────────────
  // DISTINCT is mandatory: a Feature intersects several subdivision pieces of the
  // same unit (docs/adr/0006), which would otherwise multiply its Observations.
  // Raster-filter parity with coverage comes free: buildRasterSql reads only the `aoi`
  // CTE, and matching_features ⊆ candidate_features = features ∩ aoi, so restricting
  // stage 1 to it is exact and still lets the unit_id be attached by the aoi join.
  const enabledRasterFilterTables = hasRasterFilters(filter.parameters) ? await getEnabledRasterFilterTables() : [];
  const { ctes: rasterCtes, usesMatchingFeatures } = buildRasterSql(filter, enabledRasterFilterTables);
  const featureSource = usesMatchingFeatures ? 'matching_features' : `${schema}.features`;

  await em.query(`CREATE TEMP TABLE sst_unit_features (unit_id uuid NOT NULL, feature_id uuid NOT NULL) ON COMMIT DROP`);
  await em.query(
    `WITH aoi AS MATERIALIZED (
       SELECT ugs.user_geometry_id AS unit_id, ugs.geom
       FROM ${schema}.user_geometry_subdivisions ugs
       WHERE ugs.user_geometry_id = ANY($1::uuid[])
     )${usesMatchingFeatures ? `,\n       ${rasterCtes}` : ''}
     INSERT INTO sst_unit_features (unit_id, feature_id)
     SELECT DISTINCT aoi.unit_id, f.id
     FROM ${featureSource} f
     JOIN aoi ON ST_Intersects(f.geom, aoi.geom)`,
    [unitIds],
  );
  await em.query('CREATE INDEX ON sst_unit_features (feature_id)');
  await em.query('ANALYZE sst_unit_features');
  await progress('Resolved sampling locations', 20);
  await checkCancelled();

  // ── stage 2: Features → Observations (pre-fan-out, one row per Observation) ───
  const params: any[] = [];
  const p = (val: any) => {
    params.push(val);
    return `$${params.length}`;
  };
  const slugPlaceholders = datasetSlugs.map(s => p(s)).join(', ');
  // Coverage parity: filterVector applies status and visibility, which the
  // /soil-data path does not (see buildObservationCriteria). Both are added here.
  const { whereClauses } = buildObservationCriteria(
    filter.parameters,
    p,
    { dataset: 'ds', layer: 'layer', soilProperty: 'sp', license: 'license' },
    { includeVisibility: true },
  );
  if (soilPropertySlug !== undefined) {
    whereClauses.push(`sp.slug = ${p(soilPropertySlug)}`);
  }

  await em.query(SST_OBS_DDL);

  await em.query(
    `INSERT INTO sst_obs (feature_id, layer_id, dataset_slug, soil_property_slug, standard_unit, year,
                          min_depth, max_depth, horizon, sampling_date, laboratory_method, value)
     SELECT
       dl.feature_id,
       dl.layer_id,
       ds.slug,
       sp.slug,
       sp.standard_unit,
       -- sampling_date is free text: anything not starting with four digits becomes
       -- the null year bucket rather than aborting the job on a failed cast.
       CASE WHEN layer.sampling_date ~ '^[0-9]{4}' THEN LEFT(layer.sampling_date, 4)::int END,
       layer.min_depth,
       layer.max_depth,
       layer.horizon,
       layer.sampling_date,
       lab_method.name,
       obs.value::float8
     FROM ${schema}.dataset_layers dl
     INNER JOIN ${schema}.datasets ds ON ds.id = dl.dataset_id
     INNER JOIN ${schema}.layers layer ON layer.id = dl.layer_id
     INNER JOIN ${schema}.soil_properties sp ON sp.id = dl.soil_property_id AND sp.deleted_at IS NULL
     LEFT JOIN ${schema}.licenses license ON license.id = layer.license AND license.deleted_at IS NULL
     INNER JOIN ${schema}.observations obs ON obs.dataset_layer_id = dl.id
     LEFT JOIN ${schema}.procedures procedure ON procedure.id = obs.procedure_id AND procedure.deleted_at IS NULL
     LEFT JOIN ${schema}.vocabulary lab_method ON lab_method.id = procedure.laboratory_method_id
       AND lab_method.category = 'laboratory_method' AND lab_method.deleted_at IS NULL
     WHERE dl.feature_id = ANY(ARRAY(SELECT DISTINCT feature_id FROM sst_unit_features)::uuid[])
       AND ds.deleted_at IS NULL
       AND ds.status = 'PUBLISHED'
       AND ds.gis_datatype <> '${GISDataType.RASTER}'
       AND ds.slug IN (${slugPlaceholders})
       ${whereClauses.length > 0 ? `AND ${whereClauses.join('\n         AND ')}` : ''}`,
    params,
  );
  await em.query('CREATE INDEX ON sst_obs (feature_id)');
  await em.query('CREATE INDEX ON sst_obs (dataset_slug, soil_property_slug)');
  await em.query('ANALYZE sst_obs');
  await progress('Collected observations', 45);
  await checkCancelled();

  return { usesMatchingFeatures };
};

export interface StageScoresOptions {
  run: string;
  /** UserGeometry ids that are the Aggregation Units. */
  unitIds: string[];
  onPhase: (description: string, percentage: number) => Promise<void>;
  assertNotCancelled: () => Promise<void>;
}

/**
 * Like stageObservations, but with a Soil Index Run's scores: each gets a synthetic Feature/Layer id
 * and belongs to the units containing its representative point (docs/adr/0039).
 */
export const stageScores = async (em: EntityManager, options: StageScoresOptions): Promise<void> => {
  const { run, unitIds } = options;
  const schema = process.env.POSTGRES_SCHEMA;

  await em.query(
    `CREATE TEMP TABLE sst_scores ON COMMIT DROP AS
     SELECT gen_random_uuid() AS score_id, s.value, s.year, s.soil_index_type, ST_PointOnSurface(s.geometry) AS pt
     FROM ${schema}.soil_index s
     WHERE s.run = $1::uuid`,
    [run],
  );
  await em.query('CREATE INDEX ON sst_scores USING GIST (pt)');
  await em.query('ANALYZE sst_scores');

  // DISTINCT: a point on a seam between subdivision pieces would join twice.
  await em.query(`CREATE TEMP TABLE sst_unit_features (unit_id uuid NOT NULL, feature_id uuid NOT NULL) ON COMMIT DROP`);
  await em.query(
    `INSERT INTO sst_unit_features (unit_id, feature_id)
     SELECT DISTINCT ugs.user_geometry_id, s.score_id
     FROM sst_scores s
     JOIN ${schema}.user_geometry_subdivisions ugs
       ON ugs.user_geometry_id = ANY($1::uuid[]) AND ST_Intersects(s.pt, ugs.geom)`,
    [unitIds],
  );
  await em.query('CREATE INDEX ON sst_unit_features (feature_id)');
  await em.query('ANALYZE sst_unit_features');
  await options.onPhase('Located scores', 20);
  await options.assertNotCancelled();

  await em.query(SST_OBS_DDL);
  await em.query(`
    INSERT INTO sst_obs (feature_id, layer_id, dataset_slug, soil_property_slug, year, value)
    SELECT s.score_id, s.score_id, '', s.soil_index_type, s.year, s.value
    FROM sst_scores s
    WHERE s.score_id IN (SELECT feature_id FROM sst_unit_features)`);
  await em.query('CREATE INDEX ON sst_obs (feature_id)');
  await em.query('ANALYZE sst_obs');
  await options.onPhase('Collected scores', 45);
  await options.assertNotCancelled();
};

export type StagedVariable = { soilPropertySlug: string } | { soilIndexRun: string };

export interface StageVariableOptions {
  filter: DataFilter;
  unitIds: string[];
  /** Ignored for a Soil Index Run. */
  datasetSlugs: string[];
  variable: StagedVariable;
  onPhase: (description: string, percentage: number) => Promise<void>;
  assertNotCancelled: () => Promise<void>;
}

export const stageVariable = async (em: EntityManager, options: StageVariableOptions): Promise<void> => {
  const { variable, unitIds, onPhase, assertNotCancelled } = options;
  if ('soilIndexRun' in variable) {
    await stageScores(em, { run: variable.soilIndexRun, unitIds, onPhase, assertNotCancelled });
    return;
  }
  await stageObservations(em, { ...options, soilPropertySlug: variable.soilPropertySlug });
};

export const nothingToStage = (variable: StagedVariable, unitIds: string[], datasetSlugs: string[]): boolean =>
  unitIds.length === 0 || ('soilPropertySlug' in variable && datasetSlugs.length === 0);

// ── the record ───────────────────────────────────────────────────────────────────────────
//
// Everything above computes a Data Request's payload; everything below stores the Data Request itself.

/** One `data_requests` row: a Run that reached an outcome (docs/adr/0037). */
export interface DataRequestRecord {
  /** The Run's id — the pg-boss job id, never generated here. */
  id: string;
  status: DataRequestStatus.COMPLETED | DataRequestStatus.FAILED;
  request: DataRequestParameters;
  /** Null exactly when the Run failed. */
  data: DataRequestOutput | null;
  message: string | null;
  created_at: Date;
  completed_at: Date;
}

/**
 * The `request` half of a Data Request, taken from its job data — what the row stores and what a
 * caller reads back while the job still lives, so both say the same thing.
 */
export const toDataRequestParameters = (data: DataRequestJob): DataRequestParameters => ({
  statistics_type: data.statistics_type,
  filter_id: data.filter_id,
  ...(data.file_id !== undefined ? { file_id: data.file_id } : {}),
  ...(data.label_field !== undefined ? { label_field: data.label_field } : {}),
  ...(data.dataset_ids !== undefined ? { dataset_ids: data.dataset_ids } : {}),
  ...(data.variable !== undefined ? { variable: data.variable } : {}),
  ...(data.classes !== undefined ? { classes: data.classes } : {}),
  ...(data.class_count !== undefined ? { class_count: data.class_count } : {}),
  ...(data.class_method !== undefined ? { class_method: data.class_method } : {}),
  ...(data.time_aggregation !== undefined ? { time_aggregation: data.time_aggregation } : {}),
  ...(data.depth_ranges !== undefined ? { depth_ranges: data.depth_ranges } : {}),
  ...(data.value_type !== undefined ? { value_type: data.value_type } : {}),
  derived_filter_id: data.derived_filter_id ?? null,
  unit_count: data.unit_count ?? 0,
  units: data.units ?? [],
});

/**
 * Writes the outcome of one Run. Called once, from `processDataRequest` and nowhere else.
 * Raw SQL rather than TypeORM repository to support `WHERE EXISTS`.
 */
export const insertDataRequest = async (entityManager: EntityManager, record: DataRequestRecord): Promise<void> => {
  await entityManager.query(
    `INSERT INTO data_requests ("id", "status", "request", "data", "message", "created_at", "completed_at")
     SELECT $1::uuid, $2::text, $3::jsonb, $4::jsonb, $5::text, $6::timestamptz, $7::timestamptz
     WHERE EXISTS (
       SELECT 1 FROM ${PG_BOSS_SCHEMA}.job WHERE "name" = $8::text AND "id" = $1::uuid AND "state" <> 'cancelled'
     )
     ON CONFLICT DO NOTHING`,
    [
      record.id,
      record.status,
      JSON.stringify(record.request),
      record.data === null ? null : JSON.stringify(record.data),
      record.message,
      record.created_at,
      record.completed_at,
      JobQueues.DATA_REQUESTS,
    ],
  );
};

/** Reads one Data Request by its Run's id, or null. */
export const findDataRequest = async (entityManager: EntityManager, id: string): Promise<DataRequestRecord | null> => {
  const row = await entityManager.getRepository(DataRequestEntity).findOne({ where: { id } });
  return row ? (row as unknown as DataRequestRecord) : null;
};

/** Destroys one Data Request. Returns whether a row was there to destroy. */
export const deleteDataRequest = async (entityManager: EntityManager, id: string): Promise<boolean> => {
  const result = await entityManager.getRepository(DataRequestEntity).delete({ id });
  return (result.affected ?? 0) > 0;
};
