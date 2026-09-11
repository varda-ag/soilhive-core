import { EntityManager } from 'typeorm';
import { validate } from 'uuid';
import { CreaIndexFeature } from '../jobs/soil-statistics/types';

/**
 * One partition per Run, named from the Run's uuid with the hyphens replaced by underscores:
 * 47 characters, and 55 for the CHECK constraint derived from it below, both comfortably inside
 * Postgres' 63-byte identifier limit.
 */
export const creaIndexPartition = (run: string): string => `crea_index_${run.toLowerCase().replace(/-/g, '_')}`;

/**
 * Writes one Run's scored geometries into `crea_index` as its own LIST partition.
 *
 * The partition is built standalone, filled, indexed, and only then ATTACHed (docs/adr/0030).
 * Going straight to `CREATE TABLE ... PARTITION OF` would take ACCESS EXCLUSIVE on the parent
 * for the whole load and serialise concurrent Runs against each other; ATTACH takes only
 * SHARE UPDATE EXCLUSIVE, and holds it for the attach alone. Building the GiST index before
 * the ATTACH matters for the same reason — an ATTACH that finds no matching index builds one
 * itself, under that lock, instead of adopting the one already there.
 * Create, load and attach run in one transaction, so a Run is either fully attached or absent.
 * An empty Run still gets an empty partition.
 */
export async function writeCreaIndexRun(entityManager: EntityManager, run: string, features: CreaIndexFeature[]): Promise<number> {
  // `run` reaches the DDL below by string interpolation, so validate it first to avoid SQL injection.
  if (!validate(run)) {
    throw new Error(`Refusing to build a crea_index partition for a non-uuid run: ${run}`);
  }
  const schema = process.env.POSTGRES_SCHEMA;
  const partition = `"${schema}"."${creaIndexPartition(run)}"`;
  const parent = `"${schema}"."crea_index"`;

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
      `ALTER TABLE ${partition} ADD CONSTRAINT "chk_${creaIndexPartition(run)}_run" CHECK ("run" = '${run}'::uuid)`,
    );

    await transactionalEntityManager.query(
      `INSERT INTO ${partition} ("run", "geometry", "value", "metadata")
       SELECT $1::uuid, ST_SetSRID(ST_GeomFromGeoJSON(source.geom), 4326), source.val, source.meta
       FROM jsonb_to_recordset($2::jsonb) AS source(geom jsonb, val double precision, meta jsonb)`,
      [run, JSON.stringify(rows)],
    );

    await transactionalEntityManager.query(`CREATE INDEX ON ${partition} USING GIST ("geometry")`);
    await transactionalEntityManager.query(`ALTER TABLE ${parent} ATTACH PARTITION ${partition} FOR VALUES IN ('${run}'::uuid)`);
  });

  return rows.length;
}
