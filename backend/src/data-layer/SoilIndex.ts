import { EntityManager } from 'typeorm';
import { validate } from 'uuid';
import { SoilIndexType } from '../types/enums';
import { SoilIndexFeature } from '../jobs/soil-indexes/types';

/**
 * One partition per Run, named from the Run's uuid with the hyphens replaced by underscores:
 * 47 characters, and 55 for the CHECK constraint derived from it below, both comfortably inside
 * Postgres' 63-byte identifier limit.
 */
export const soilIndexPartition = (run: string): string => `soil_index_${run.toLowerCase().replace(/-/g, '_')}`;

/**
 * Writes one Run's scored geometries into `soil_index` as its own LIST partition.
 *
 * The partition is built standalone, filled, indexed, and only then ATTACHed.
 * Create, load and attach run in one transaction, so a Run is either fully attached or absent.
 * An empty Run still gets an empty partition.
 *
 * `soilIndexType` is stored on every row rather than inferred from the Run, because a Run's
 * pg-boss record is deleted on retention while its partition is permanent: without the column, an
 * old score would be a number with no methodology attached (ADR 0036).
 */
export async function writeSoilIndexRun(
  entityManager: EntityManager,
  run: string,
  soilIndexType: SoilIndexType,
  features: SoilIndexFeature[],
): Promise<number> {
  // `run` reaches the DDL below by string interpolation, so validate it first to avoid SQL injection.
  if (!validate(run)) {
    throw new Error(`Refusing to build a soil_index partition for a non-uuid run: ${run}`);
  }
  const schema = process.env.POSTGRES_SCHEMA;
  const partition = `"${schema}"."${soilIndexPartition(run)}"`;
  const parent = `"${schema}"."soil_index"`;

  await entityManager.query(`DROP TABLE IF EXISTS ${partition}`);

  // `metadata` carries the unit_id because nothing else does
  const rows = features.map(feature => ({
    geom: feature.geometry,
    val: feature.properties.value,
    meta: { unit_id: feature.id },
  }));

  await entityManager.transaction(async transactionalEntityManager => {
    await transactionalEntityManager.query(`CREATE TABLE ${partition} (LIKE ${parent} INCLUDING DEFAULTS)`);
    await transactionalEntityManager.query(
      `ALTER TABLE ${partition} ADD CONSTRAINT "chk_${soilIndexPartition(run)}_run" CHECK ("run" = '${run}'::uuid)`,
    );

    await transactionalEntityManager.query(
      `INSERT INTO ${partition} ("run", "soil_index_type", "geometry", "value", "metadata")
       SELECT $1::uuid, $2::text, ST_SetSRID(ST_GeomFromGeoJSON(source.geom), 4326), source.val, source.meta
       FROM jsonb_to_recordset($3::jsonb) AS source(geom jsonb, val double precision, meta jsonb)`,
      [run, soilIndexType, JSON.stringify(rows)],
    );

    await transactionalEntityManager.query(`CREATE INDEX ON ${partition} USING GIST ("geometry")`);

    // Add statistics to the partition.
    // ANALYZE is allowed inside a transaction block, unlike VACUUM.
    await transactionalEntityManager.query(`ANALYZE ${partition}`);

    await transactionalEntityManager.query(`ALTER TABLE ${parent} ATTACH PARTITION ${partition} FOR VALUES IN ('${run}'::uuid)`);
  });

  return rows.length;
}
