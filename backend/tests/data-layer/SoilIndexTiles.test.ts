import { describe, it, expect, afterEach } from '@jest/globals';
import { v4 as uuidv4 } from 'uuid';
import { getEntityManager } from '../../src/utils/data-source';
import { getPolygonFromBbox } from '../../src/utils/geometry';
import { soilIndexTilesPartition, TILE_MAX_ZOOM, writeSoilIndexRun } from '../../src/data-layer/SoilIndex';
import { destroySoilIndexRun, findSoilIndexRun } from '../../src/data-layer/SoilIndexRuns';
import {
  findPrerenderedTile,
  getSoilIndexScore,
  getSoilIndexTiling,
  gunzipTile,
  prerenderSoilIndexTiles,
  renderTile,
  tileLonLatBounds,
  tileTouchesBounds,
} from '../../src/data-layer/SoilIndexTiles';
import { SoilIndexFeature } from '../../src/jobs/soil-indexes/types';
import { SoilIndexType } from '../../src/types/enums';

// ── A minimal MVT reader: just the fields these tests assert on ──────────────

type Value = string | number | boolean;
interface DecodedFeature {
  id?: number;
  properties: Record<string, Value>;
}

class Reader {
  position = 0;
  constructor(private readonly bytes: Buffer) {}
  get done() {
    return this.position >= this.bytes.length;
  }
  varint(): number {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = this.bytes[this.position++]!;
      result += (byte & 0x7f) * 2 ** shift;
      shift += 7;
    } while (byte & 0x80);
    return result;
  }
  bytesField(): Buffer {
    const length = this.varint();
    const slice = this.bytes.subarray(this.position, this.position + length);
    this.position += length;
    return slice;
  }
  skip(wireType: number) {
    if (wireType === 0) this.varint();
    else if (wireType === 1) this.position += 8;
    else if (wireType === 2) this.bytesField();
    else if (wireType === 5) this.position += 4;
  }
}

const decodeValue = (bytes: Buffer): Value => {
  const reader = new Reader(bytes);
  const field = reader.varint() >> 3;
  if (field === 1) return reader.bytesField().toString('utf8');
  if (field === 2) return bytes.readFloatLE(reader.position);
  if (field === 3) return bytes.readDoubleLE(reader.position);
  if (field === 6) {
    const zigzag = reader.varint();
    return zigzag % 2 ? -(zigzag + 1) / 2 : zigzag / 2;
  }
  if (field === 7) return reader.varint() === 1;
  // int_value and uint_value
  return reader.varint();
};

/** The features of one layer, with their tags resolved to properties. */
const decodeLayer = (mvt: Buffer, layerName: string): DecodedFeature[] => {
  const tile = new Reader(mvt);
  while (!tile.done) {
    const tag = tile.varint();
    if (tag >> 3 !== 3) {
      tile.skip(tag & 7);
      continue;
    }
    const layer = new Reader(tile.bytesField());
    let name = '';
    const keys: string[] = [];
    const values: Value[] = [];
    const raw: { id?: number; tags: number[] }[] = [];
    while (!layer.done) {
      const layerTag = layer.varint();
      const field = layerTag >> 3;
      if (field === 1) name = layer.bytesField().toString('utf8');
      else if (field === 3) keys.push(layer.bytesField().toString('utf8'));
      else if (field === 4) values.push(decodeValue(layer.bytesField()));
      else if (field === 2) {
        const feature = new Reader(layer.bytesField());
        const decoded: { id?: number; tags: number[] } = { tags: [] };
        while (!feature.done) {
          const featureTag = feature.varint();
          if (featureTag >> 3 === 1) decoded.id = feature.varint();
          else if (featureTag >> 3 === 2) {
            const packed = new Reader(feature.bytesField());
            while (!packed.done) decoded.tags.push(packed.varint());
          } else feature.skip(featureTag & 7);
        }
        raw.push(decoded);
      } else layer.skip(layerTag & 7);
    }
    if (name === layerName) {
      return raw.map(({ id, tags }) => {
        const properties: Record<string, Value> = {};
        for (let index = 0; index < tags.length; index += 2) {
          properties[keys[tags[index]!]!] = values[tags[index + 1]!]!;
        }
        return { ...(id === undefined ? {} : { id }), properties };
      });
    }
  }
  return [];
};

// ── Fixtures ──────────────────────────────────────────────────────────────────

const point = (lon: number, lat: number, value: number, year?: number): SoilIndexFeature => ({
  type: 'Feature',
  id: uuidv4(),
  geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: { value, ...(year === undefined ? {} : { year }) },
});

const writeRun = async (features: SoilIndexFeature[]): Promise<string> => {
  const run = uuidv4();
  await writeSoilIndexRun(await getEntityManager(), run, SoilIndexType.CREA_INDEX, features);
  return run;
};

const withAggregationBudget = async <T>(maxVertices: number, run: () => Promise<T>): Promise<T> => {
  process.env['TILES_AGGREGATION_MAX_VERTICES'] = String(maxVertices);
  try {
    return await run();
  } finally {
    delete process.env['TILES_AGGREGATION_MAX_VERTICES'];
  }
};

// The z0 tile holds the whole world; these are the tiles at TILE_MAX_ZOOM around (0.5, 0.5).
const WORLD = { z: 0, x: 0, y: 0 };

describe('soil index tiles', () => {
  afterEach(() => {
    delete process.env['TILES_AGGREGATION_MAX_VERTICES'];
  });

  describe('writing a Run', () => {
    it('numbers its scores 1..n in the order given, and keeps their years', async () => {
      const run = await writeRun([point(0.1, 0.1, 0.2, 2020), point(0.2, 0.2, 0.4), point(0.3, 0.3, 0.6, 2021)]);
      const rows = await (
        await getEntityManager()
      ).query(`SELECT id, year, value FROM ${process.env.POSTGRES_SCHEMA}.soil_index WHERE run = $1 ORDER BY id`, [run]);

      expect(rows).toEqual([
        { id: 1, year: 2020, value: 0.2 },
        { id: 2, year: null, value: 0.4 },
        { id: 3, year: 2021, value: 0.6 },
      ]);
    });

    it('records its bounds and the zoom from which every tile fits the budget', async () => {
      const run = await writeRun([point(1, 2, 0.1), point(3, 4, 0.2)]);

      // Two points never exceed the default budget, so the Run is raw from z0.
      expect(await getSoilIndexTiling(await getEntityManager(), run)).toEqual({ bounds: [1, 2, 3, 4], detailZoom: 0 });
    });

    it('records neither for a Run that scored nothing', async () => {
      const run = await writeRun([]);

      expect(await getSoilIndexTiling(await getEntityManager(), run)).toEqual({ bounds: null, detailZoom: null });
    });

    it('counts vertices, not features, against the budget', async () => {
      // One five-vertex ring is over a four-vertex budget at every zoom: cells throughout.
      const polygon = { ...point(0, 0, 0.5), geometry: getPolygonFromBbox([0.1, 0.1, 0.2, 0.2]) } as SoilIndexFeature;
      const run = await withAggregationBudget(4, () => writeRun([polygon]));

      expect((await getSoilIndexTiling(await getEntityManager(), run))!.detailZoom).toBe(TILE_MAX_ZOOM + 1);
    });

    it('is unknown to tiling until written', async () => {
      expect(await getSoilIndexTiling(await getEntityManager(), uuidv4())).toBeNull();
      expect(await getSoilIndexTiling(await getEntityManager(), 'not-a-uuid')).toBeNull();
    });
  });

  describe('rendering', () => {
    it('draws Scored Geometries from the detail zoom, each with its score id', async () => {
      const run = await writeRun([point(0.5, 0.5, 0.25, 2020), point(0.6, 0.6, 0.75)]);
      const mvt = await renderTile(await getEntityManager(), run, 0, WORLD);

      const features = decodeLayer(mvt!, 'scores');
      expect(features.map(feature => feature.id).sort()).toEqual([1, 2]);
      const first = features.find(feature => feature.id === 1)!;
      expect(first.properties).toEqual({ value: 0.25, year: 2020 });
      // Absent rather than null, and no cell attributes on a score.
      expect(features.find(feature => feature.id === 2)!.properties).toEqual({ value: 0.75 });
    });

    it('summarises scores per cell and year below the detail zoom', async () => {
      // Close enough to share a cell at z0, where a cell is 1/64 of the world.
      const run = await writeRun([point(0.5, 0.5, 0.2, 2020), point(0.6, 0.6, 0.4, 2020), point(0.55, 0.55, 0.9, 2021)]);
      const mvt = await renderTile(await getEntityManager(), run, 1, WORLD);

      const features = decodeLayer(mvt!, 'scores');
      const byYear = new Map(features.map(feature => [feature.properties['year'], feature]));
      expect(byYear.get(2020)!.properties).toEqual({
        value: expect.closeTo(0.3, 5),
        min: expect.closeTo(0.2, 5),
        max: expect.closeTo(0.4, 5),
        count: 2,
        year: 2020,
      });
      expect(byYear.get(2021)!.properties['count']).toBe(1);
      // Cell ids never collide with score ids, which are all below 2^31.
      expect(features.every(feature => feature.id! >= 2 ** 31)).toBe(true);
      expect(new Set(features.map(feature => feature.id)).size).toBe(2);
    });

    it('counts a score in one tile only, by its representative point', async () => {
      // Straddles the z1 boundary at longitude 0; its interior point is east of it.
      const straddling = { ...point(0, 0, 0.5), geometry: getPolygonFromBbox([-1, 10, 3, 11]) } as SoilIndexFeature;
      const run = await writeRun([straddling]);
      const entityManager = await getEntityManager();

      const west = await renderTile(entityManager, run, 2, { z: 1, x: 0, y: 0 });
      const east = await renderTile(entityManager, run, 2, { z: 1, x: 1, y: 0 });
      expect(west).toBeNull();
      expect(decodeLayer(east!, 'scores')).toHaveLength(1);
    });

    it('returns nothing for an empty tile', async () => {
      const run = await writeRun([point(0.5, 0.5, 0.2)]);

      expect(await renderTile(await getEntityManager(), run, 0, { z: 4, x: 0, y: 0 })).toBeNull();
    });

    it('draws scores beyond Web Mercator latitudes at its edge, without failing at a pole', async () => {
      // A point at the pole cannot be projected at all; one at 88° projects outside the world.
      const straddling = { ...point(0, 0, 0.7), geometry: getPolygonFromBbox([20, 84, 21, 87]) } as SoilIndexFeature;
      const run = await writeRun([point(10, 90, 0.5), point(11, 88, 0.6), straddling]);

      // Top row of z1, which the clamped points and the clipped polygon all fall in.
      const mvt = await renderTile(await getEntityManager(), run, 0, { z: 1, x: 1, y: 0 });

      expect(
        decodeLayer(mvt!, 'scores')
          .map(feature => feature.id)
          .sort(),
      ).toEqual([1, 2, 3]);
    });
  });

  describe('pre-rendering', () => {
    it('stores the tiles over the budget, lowest zooms first, up to the cap', async () => {
      const run = await writeRun([point(0.5, 0.5, 0.2), point(0.6, 0.6, 0.4)]);
      const entityManager = await getEntityManager();

      const { rendered, capped } = await prerenderSoilIndexTiles(entityManager, run, { minVertices: 1, maxTiles: 3 });

      expect({ rendered, capped }).toEqual({ rendered: 3, capped: true });
      const stored = await entityManager.query(`SELECT z FROM ${process.env.POSTGRES_SCHEMA}.soil_index_tiles WHERE run = $1 ORDER BY z`, [
        run,
      ]);
      expect(stored.map((row: { z: number }) => row.z)).toEqual([0, 1, 2]);

      // Stored gzipped, and identical to what a request would have cut.
      const tiling = await getSoilIndexTiling(entityManager, run);
      const prerendered = await findPrerenderedTile(entityManager, run, WORLD);
      expect(await gunzipTile(prerendered!)).toEqual(await renderTile(entityManager, run, tiling!.detailZoom!, WORLD));
    });

    it('attaches an empty partition when nothing is over the budget', async () => {
      const run = await writeRun([point(0.5, 0.5, 0.2)]);
      const entityManager = await getEntityManager();

      expect(await prerenderSoilIndexTiles(entityManager, run, { minVertices: 1000, maxTiles: 10 })).toEqual({
        rendered: 0,
        capped: false,
        destroyed: false,
      });
      expect(await findPrerenderedTile(entityManager, run, WORLD)).toBeNull();
    });

    it('is redone whole when the Run is rewritten', async () => {
      const entityManager = await getEntityManager();
      const run = uuidv4();
      await writeSoilIndexRun(entityManager, run, SoilIndexType.CREA_INDEX, [point(0.5, 0.5, 0.2)]);
      await prerenderSoilIndexTiles(entityManager, run, { minVertices: 0, maxTiles: 10 });

      await writeSoilIndexRun(entityManager, run, SoilIndexType.CREA_INDEX, [point(0.5, 0.5, 0.2)]);

      expect(await findPrerenderedTile(entityManager, run, WORLD)).toBeNull();
    });

    it('leaves nothing behind for a Run destroyed before it started', async () => {
      const entityManager = await getEntityManager();
      const run = await writeRun([point(0.5, 0.5, 0.2)]);
      await destroySoilIndexRun(entityManager, run);

      expect(await prerenderSoilIndexTiles(entityManager, run, { minVertices: 0, maxTiles: 10 })).toEqual({
        rendered: 0,
        capped: false,
        destroyed: true,
      });
      const [{ present }] = await entityManager.query(`SELECT to_regclass($1) IS NOT NULL AS present`, [
        `${process.env['POSTGRES_SCHEMA']}.${soilIndexTilesPartition(run)}`,
      ]);
      expect(present).toBe(false);
    });
  });

  describe('the Run record', () => {
    it('writes nothing when the Run is no longer live as it stores its scores', async () => {
      const entityManager = await getEntityManager();
      const run = uuidv4();

      expect(
        await writeSoilIndexRun(entityManager, run, SoilIndexType.CREA_INDEX, [point(0.5, 0.5, 0.2)], { assertLive: async () => false }),
      ).toBeNull();
      expect(await findSoilIndexRun(entityManager, run)).toBeNull();
      expect(await getSoilIndexScore(entityManager, run, 1)).toBeNull();
    });

    it('is destroyed with its scores and tiles, once', async () => {
      const entityManager = await getEntityManager();
      const run = await writeRun([point(0.5, 0.5, 0.2)]);
      await prerenderSoilIndexTiles(entityManager, run, { minVertices: 0, maxTiles: 2 });

      expect(await destroySoilIndexRun(entityManager, run)).toBe(true);

      expect(await findSoilIndexRun(entityManager, run)).toBeNull();
      expect(await getSoilIndexScore(entityManager, run, 1)).toBeNull();
      expect(await findPrerenderedTile(entityManager, run, WORLD)).toBeNull();
      expect(await destroySoilIndexRun(entityManager, run)).toBe(false);
    });
  });

  describe('scores', () => {
    it('reads one score with its metadata, leaving out a missing year', async () => {
      const run = await writeRun([point(0.5, 0.5, 0.2, 2020), point(0.6, 0.6, 0.4)]);
      const entityManager = await getEntityManager();

      expect(await getSoilIndexScore(entityManager, run, 1)).toEqual({
        id: 1,
        value: 0.2,
        year: 2020,
        metadata: { unit_id: expect.any(String) },
      });
      expect(await getSoilIndexScore(entityManager, run, 2)).not.toHaveProperty('year');
      expect(await getSoilIndexScore(entityManager, run, 3)).toBeNull();
      expect(await getSoilIndexScore(entityManager, 'not-a-uuid', 1)).toBeNull();
    });
  });

  describe('tileLonLatBounds', () => {
    it('clamps a widened edge tile to the antimeridian instead of wrapping it round the globe', () => {
      const [west, , east] = tileLonLatBounds({ z: 1, x: 0, y: 0 }, 1 / 64);

      expect(west).toBe(-180);
      expect(east).toBeCloseTo(2.8125, 6);
    });

    it('reaches the poles on the top and bottom rows', () => {
      expect(tileLonLatBounds({ z: 2, x: 1, y: 0 })[3]).toBe(90);
      expect(tileLonLatBounds({ z: 2, x: 1, y: 3 })[1]).toBe(-90);
    });

    it('summarises scores beyond Web Mercator latitudes in the top row of cells', async () => {
      const run = await writeRun([point(10, 88, 0.5)]);

      expect(decodeLayer((await renderTile(await getEntityManager(), run, 1, WORLD))!, 'scores')).toHaveLength(1);
    });
  });

  describe('tileTouchesBounds', () => {
    it('is true for the tile holding the bounds and false for a distant one', () => {
      const bounds: [number, number, number, number] = [10, 45, 11, 46];

      expect(tileTouchesBounds(WORLD, bounds)).toBe(true);
      expect(tileTouchesBounds({ z: 1, x: 1, y: 0 }, bounds)).toBe(true);
      expect(tileTouchesBounds({ z: 1, x: 0, y: 1 }, bounds)).toBe(false);
    });
  });
});
