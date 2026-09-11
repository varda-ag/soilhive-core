import { EntityManager } from 'typeorm';
import { CreaIndexFeature } from '../jobs/soil-statistics/types';

/**
 * `run` reaches the DDL below by string interpolation, because a partition bound and a table
 * name cannot be parameterised. It is a pg-boss job id and therefore already a uuid, but that
 * is an assumption about a value that arrives inside job data — which outlives the request
 * that produced it — so it is checked rather than trusted.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One partition per Run, named from the Run's uuid with the hyphens stripped: 43 characters,
 * comfortably inside Postgres' 63-byte identifier limit, and reversible to the Run id by eye.
 */
export const creaIndexPartition = (run: string): string => `crea_index_${run.toLowerCase().replace(/-/g, '')}`;

/**
 * Writes one Run's scored geometries into `crea_index` as its own LIST partition.
 *
 * The partition is built standalone, filled, indexed, and only then ATTACHed (docs/adr/0030).
 * Going straight to `CREATE TABLE ... PARTITION OF` would take ACCESS EXCLUSIVE on the parent
 * for the whole load and serialise concurrent Runs against each other; ATTACH takes only
 * SHARE UPDATE EXCLUSIVE, and holds it for the attach alone. Building the GiST index before
 * the ATTACH matters for the same reason — an ATTACH that finds no matching index builds one
 * itself, under that lock, instead of adopting the one already there.
 *
 * The CHECK constraint is not redundant with the partition bound: it lets ATTACH prove every
 * row already satisfies the bound and skip the full validation scan.
 *
 * Create, load and attach run in one transaction, so a Run is either fully attached or absent
 * — never a staging table nobody will look at again. The pre-emptive DROP is deliberately
 * *outside* it: on a pg-boss retry the previous attempt's partition may be attached, and
 * dropping an attached partition takes ACCESS EXCLUSIVE on the parent, which inside the
 * transaction would then be held across the entire load rather than for the drop.
 *
 * An empty Run still gets an empty partition. `WHERE run = ...` cannot distinguish a Run that
 * scored nothing from one that never happened, and with no run registry (docs/adr/0030) the
 * partition's existence is the only record that the Run produced output at all.
 */
export async function writeCreaIndexRun(entityManager: EntityManager, run: string, features: CreaIndexFeature[]): Promise<number> {
  if (!UUID.test(run)) {
    throw new Error(`Refusing to build a crea_index partition for a non-uuid run: ${run}`);
  }
  const schema = process.env.POSTGRES_SCHEMA;
  const partition = `"${schema}"."${creaIndexPartition(run)}"`;
  const parent = `"${schema}"."crea_index"`;

  await entityManager.query(`DROP TABLE IF EXISTS ${partition}`);

  // `metadata` carries the unit_id because nothing else does: the table has no primary key and
  // no unit column, so this is the whole of the path from a scored row back to the area it
  // scored — the join to the job's units[] for the label, record ids and area.
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
