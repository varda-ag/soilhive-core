import { EntityManager } from 'typeorm';
import { validate } from 'uuid';
import { PG_BOSS_SCHEMA } from '../services/PgBoss';
import { DataRequestStatus, JobQueues } from '../types/enums';
import { SoilIndexJob } from '../interfaces/Job';
import { SoilIndexRunOutput, SoilIndexRunParameters } from '../interfaces/SoilIndexRun';
import { soilIndexPartition, soilIndexTilesPartition } from './SoilIndex';

/** A Soil Index Run's `soil_index_runs` row, as `/soil-indexes` reads it (docs/adr/0044). */
export interface SoilIndexRunRecord {
  id: string;
  status: DataRequestStatus.COMPLETED | DataRequestStatus.FAILED;
  request: SoilIndexRunParameters;
  message: string | null;
  created_at: Date;
  completed_at: Date;
  /** Null exactly when the Run failed. */
  data: SoilIndexRunOutput | null;
}

const runsTable = () => `"${process.env.POSTGRES_SCHEMA}"."soil_index_runs"`;

/** The Run's TileJSON, relative to the API base. */
export const soilIndexTilesPath = (run: string): string => `/soil-indexes/${run}/tiles`;

/** What the record keeps of a job's data: never `created_by` or the privilege flags. */
export const toSoilIndexRunParameters = (data: SoilIndexJob): SoilIndexRunParameters => ({
  soil_index_type: data.soil_index_type,
  filter_id: data.filter_id,
  ...(data.file_id !== undefined ? { file_id: data.file_id } : {}),
  ...(data.label_field !== undefined ? { label_field: data.label_field } : {}),
  ...(data.config_id !== undefined ? { config_id: data.config_id } : {}),
  derived_filter_id: data.derived_filter_id ?? null,
  unit_count: data.unit_count ?? 0,
  units: data.units ?? [],
});

/**
 * Locks the Run's job until the caller's transaction ends, and says whether it may still write. A
 * DELETE cancels the job before destroying anything, so with the lock held the two cannot
 * interleave: whichever commits first, nothing is left behind.
 */
export const lockLiveSoilIndexJob = async (entityManager: EntityManager, run: string): Promise<boolean> => {
  const [row]: { state: string }[] = await entityManager.query(
    `SELECT state FROM ${PG_BOSS_SCHEMA}.job WHERE "name" = $1 AND "id" = $2::uuid FOR UPDATE`,
    [JobQueues.SOIL_INDEXES, run],
  );
  return !!row && row.state !== 'cancelled';
};

/**
 * Records a failed Run, unless its job was cancelled: a cancelled Run leaves nothing. A completed
 * record is written by writeSoilIndexRun instead, with the scores it describes.
 */
export const insertFailedSoilIndexRun = async (
  entityManager: EntityManager,
  record: { id: string; request: SoilIndexRunParameters; message: string; created_at: Date },
): Promise<void> => {
  await entityManager.query(
    `INSERT INTO ${runsTable()} ("run", "status", "request", "message", "created_at", "completed_at")
     SELECT $1::uuid, 'failed', $2::jsonb, $3::text, $4::timestamptz, now()
     WHERE EXISTS (
       SELECT 1 FROM ${PG_BOSS_SCHEMA}.job WHERE "name" = $5::text AND "id" = $1::uuid AND "state" <> 'cancelled'
     )
     ON CONFLICT DO NOTHING`,
    [record.id, JSON.stringify(record.request), record.message, record.created_at, JobQueues.SOIL_INDEXES],
  );
};

/** One Run's record by its id, or null. */
export const findSoilIndexRun = async (entityManager: EntityManager, id: string): Promise<SoilIndexRunRecord | null> => {
  const [row]: {
    id: string;
    status: SoilIndexRunRecord['status'];
    request: SoilIndexRunParameters;
    message: string | null;
    created_at: Date;
    completed_at: Date;
    score_count: number | null;
    west: number | null;
    south: number | null;
    east: number | null;
    north: number | null;
  }[] = await entityManager.query(
    `SELECT "run" AS id, status, request, message, created_at, completed_at, score_count,
            ST_XMin(bounds) AS west, ST_YMin(bounds) AS south, ST_XMax(bounds) AS east, ST_YMax(bounds) AS north
     FROM ${runsTable()}
     WHERE "run" = $1::uuid`,
    [id],
  );
  if (!row) {
    return null;
  }
  const bounds =
    row.west === null ? undefined : ([row.west, row.south, row.east, row.north].map(Number) as [number, number, number, number]);
  return {
    id: row.id,
    status: row.status,
    request: row.request,
    message: row.message,
    created_at: row.created_at,
    completed_at: row.completed_at,
    data:
      row.status === DataRequestStatus.COMPLETED
        ? { score_count: row.score_count!, ...(bounds ? { bounds } : {}), tiles: soilIndexTilesPath(row.id) }
        : null,
  };
};

/** Whether a record exists, and the config item it is attached to. */
export const findSoilIndexRunAttachment = async (
  entityManager: EntityManager,
  id: string,
): Promise<{ config_id: string | null } | null> => {
  const [row]: { config_id: string | null }[] = await entityManager.query(
    `SELECT "request"->>'config_id' AS config_id FROM ${runsTable()} WHERE "run" = $1::uuid`,
    [id],
  );
  return row ?? null;
};

/** The ids of every recorded Run attached to a config item. */
export const findAttachedSoilIndexRuns = async (entityManager: EntityManager, configId: string): Promise<string[]> => {
  const rows: { run: string }[] = await entityManager.query(`SELECT "run" FROM ${runsTable()} WHERE "request"->>'config_id' = $1::text`, [
    configId,
  ]);
  return rows.map(row => row.run);
};

/**
 * Destroys one Run's record, scores and pre-rendered tiles together (docs/adr/0044). The record
 * goes first: pre-rendering locks it before attaching its tiles, so it either finishes before this
 * or finds nothing to attach to. Returns whether there was anything to destroy.
 */
export const destroySoilIndexRun = async (entityManager: EntityManager, run: string): Promise<boolean> => {
  // `run` reaches the DDL below by string interpolation.
  if (!validate(run)) {
    return false;
  }
  const schema = process.env.POSTGRES_SCHEMA;
  const [, deleted]: [unknown, number] = await entityManager.query(`DELETE FROM ${runsTable()} WHERE "run" = $1::uuid`, [run]);
  const [partition]: { scored: boolean }[] = await entityManager.query(`SELECT to_regclass($1) IS NOT NULL AS scored`, [
    `"${schema}"."${soilIndexPartition(run)}"`,
  ]);
  await entityManager.query(`DROP TABLE IF EXISTS "${schema}"."${soilIndexTilesPartition(run)}"`);
  await entityManager.query(`DROP TABLE IF EXISTS "${schema}"."${soilIndexPartition(run)}"`);
  return deleted > 0 || !!partition?.scored;
};
