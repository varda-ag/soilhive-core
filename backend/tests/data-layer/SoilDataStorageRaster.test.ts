import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import * as turf from '@turf/turf';
import { writeArrayBuffer } from 'geotiff';
import { MultiPolygon, Polygon } from 'geojson';
import { getEntityManager } from '../../src/utils/data-source';
import { getPolygonFromBbox } from '../../src/utils/geometry';
import { addLicense, addRasterData, addSyntheticData, syntheticDataOptions } from '../../src/utils/mock';
import SoilDataStorage from '../../src/data-layer/SoilDataStorage';
import { decodeCursor, encodeCursor } from '../../src/utils/cursor';
import { DataFilter, FilterCriteria } from '../../src/interfaces/DatasetFilter';
import { SoilDataSample } from '../../src/interfaces/SoilDataSample';
import { Token } from '../../src/interfaces/Token';
import { GISDataType, IngestionStatus } from '../../src/types/data';
import * as RasterUtilsModule from '../../src/utils/raster';
import { log } from '../../src/utils/logger';
import * as computeRasterFootprints from '../../src/scripts/computeRasterFootprints';
import { addRasterFilterData, addRasterFilterMappings } from '../helper';
import { workerOutputDir, writableAsset } from '../assets';

// addRasterData ingests through the real pipeline — at the production MIN_TILES=256 floor that's 60s+ per call even for
// these tiny fixtures.
(computeRasterFootprints as unknown as { MIN_TILES: number }).MIN_TILES = 16;

const entitlements = {};
const sds = new SoilDataStorage();

// Fixture grid: EPSG:4326, 12 × 8 pixels of 0.01°, top-left corner at (10°E, 50°N). Pixel (row, col)
// spans lon [10 + col/100, 10 + (col+1)/100] and lat [50 - (row+1)/100, 50 - row/100].
const WIDTH = 12;
const HEIGHT = 8;
const ORIGIN_X = 10;
const ORIGIN_Y = 50;
const RES = 0.01;
const NODATA = -9999;
const pixelValue = (row: number, col: number, offset = 0) => offset + row * 10 + col + 0.5;
// Pixel (1, 1) holds the nodata marker and pixel (1, 2) NaN
const isInvalid = (row: number, col: number) => row === 1 && (col === 1 || col === 2);
// Pixel (3, 4) holds a value Float32 cannot represent exactly
const INEXACT_VALUE = 6.2869;

const writeFixture = (name: string, offset = 0): string => {
  const data = new Float32Array(WIDTH * HEIGHT);
  for (let row = 0; row < HEIGHT; row++) {
    for (let col = 0; col < WIDTH; col++) {
      data[row * WIDTH + col] = row === 1 && col === 1 ? NODATA : row === 1 && col === 2 ? Number.NaN : pixelValue(row, col, offset);
    }
  }
  data[3 * WIDTH + 4] = INEXACT_VALUE;
  const buffer = writeArrayBuffer(data, {
    height: HEIGHT,
    width: WIDTH,
    SamplesPerPixel: 1,
    BitsPerSample: [32],
    SampleFormat: [3], // IEEE float
    GDAL_NODATA: String(NODATA),
    GTModelTypeGeoKey: 2, // ModelTypeGeographic
    GTRasterTypeGeoKey: 1, // RasterPixelIsArea
    GeographicTypeGeoKey: 4326,
    GeogCitationGeoKey: 'WGS 84',
    ModelTiepoint: [0, 0, 0, ORIGIN_X, ORIGIN_Y, 0],
    ModelPixelScale: [RES, RES, 0],
  });
  const filePath = path.join(workerOutputDir('soil-data-raster'), name);
  fs.writeFileSync(filePath, Buffer.from(buffer));
  return filePath;
};

const lonLatBox = (west: number, south: number, east: number, north: number): Polygon => getPolygonFromBbox([west, south, east, north]);

const makeFilter = async (geometry?: Polygon | MultiPolygon, parameters: FilterCriteria = {}): Promise<DataFilter> => {
  if (!geometry) return { geometryIds: [], parameters, area: 0 };
  const entityManager = await getEntityManager();
  // Mirrors FilterService.insertUserGeometry (and makeFilter in SoilDataStorage.test.ts)
  const [{ id, area }] = await entityManager.query(
    `WITH input AS (
       SELECT ST_MakeValid(ST_GeomFromGeoJSON($1), 'method=structure') AS geom
     ), inserted AS (
       INSERT INTO user_geometries (geom)
       SELECT geom FROM input
       ON CONFLICT (geom_hash) DO NOTHING
       RETURNING id, area
     )
     SELECT id, area FROM inserted
     UNION ALL
     SELECT ug.id, ug.area
     FROM user_geometries ug, input
     WHERE ug.geom_hash = encode(sha256(input.geom::TEXT::BYTEA), 'hex')
     LIMIT 1`,
    [JSON.stringify(geometry)],
  );
  return { geometryIds: [id], parameters, area: Number(area) };
};

const addFixtureLayer = async (
  name: string,
  options: {
    offset?: number;
    dataset?: string;
    soilProperty?: string;
    status?: IngestionStatus;
    laboratoryMethod?: string;
    referencePeriod?: [string, string];
  } = {},
) =>
  addRasterData(writeFixture(name, options.offset), {
    dataset: options.dataset ?? 'raster-rows-ds',
    soilProperty: options.soilProperty ?? 'Raster Rows Property',
    layerFields: {
      min_depth: 0,
      max_depth: 30,
      laboratoryMethod: options.laboratoryMethod ?? null,
      reference_period_start: options.referencePeriod?.[0] ?? null,
      reference_period_stop: options.referencePeriod?.[1] ?? null,
    },
    dataset_status: options.status ?? IngestionStatus.PUBLISHED,
    visibility: 'public',
  });

const getSoilData = async (filter: DataFilter, slugs: string[], limit: number, cursor?: string, sort?: string) =>
  sds.getSoilData({ entityManager: await getEntityManager(), entitlements }, filter, slugs, limit, cursor, sort);

/** Every row, page by page, following each page's last cursor. */
const getAllPages = async (filter: DataFilter, slugs: string[], limit: number, sort?: string) => {
  const pages: SoilDataSample[][] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await getSoilData(filter, slugs, limit, cursor, sort);
    if (page.length === 0) break;
    pages.push(page);
    cursor = page[page.length - 1]!.cursor;
  }
  return pages;
};

const position = (row: SoilDataSample) => {
  const { raster } = decodeCursor(row.cursor);
  return `${raster!.row}:${raster!.col}`;
};

describe('SoilDataStorage.getSoilData raster rows', () => {
  let mockSelectOverview: any;
  beforeAll(() => {
    // Do not reference any overview (they don't exist in test dump)
    mockSelectOverview = jest.spyOn(RasterUtilsModule, 'selectOverviewTable').mockImplementation((table: string) => table);
  });
  afterAll(() => {
    mockSelectOverview.mockRestore();
  });

  it('returns the pixel a point-lookup AOI lies in, even away from the pixel centre', async () => {
    const layer = await addFixtureLayer('lookup.tif');
    // Inside pixel (2, 3) — lon [10.03, 10.04], lat [49.97, 49.98] — but nowhere near its centre
    const filter = await makeFilter(lonLatBox(10.031, 49.971, 10.033, 49.973));

    const rows = await getSoilData(filter, [layer.dataset.slug], 100);

    expect(rows).toHaveLength(1);
    const { cursor, ...row } = rows[0]!;
    expect(row).toEqual({
      id: `${layer.id}:2:3`,
      dataset_id: layer.dataset.slug,
      dataset_name: layer.dataset.name,
      gis_datatype: GISDataType.RASTER,
      soil_property: layer.soil_property.slug,
      property_acronym: layer.soil_property.property_acronym,
      property_name: layer.soil_property.property_name,
      standard_unit: layer.soil_property.standard_unit,
      value: 23.5,
      value_label: null,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [10.03, 49.97],
            [10.04, 49.97],
            [10.04, 49.98],
            [10.03, 49.98],
            [10.03, 49.97],
          ],
        ],
      },
      license_name: null,
      sampling_date: null,
      min_depth: 0,
      max_depth: 30,
      resolution_m: Math.round(RES * 111320),
      reference_period_start: null,
      reference_period_stop: null,
      sample_pretreatment: null,
      technique: null,
      laboratory_method: null,
      extractant_concentration: null,
      extraction_ratio: null,
      extraction_base: null,
      measurement_procedure: null,
      limit_of_detection: null,
    });
    expect(decodeCursor(cursor)).toEqual({ id: `${layer.id}:2:3`, raster: { layer: layer.id, row: 2, col: 3 } });
  });

  it('returns a Float32 pixel value exactly as read, not reformatted', async () => {
    const layer = await addFixtureLayer('inexact.tif');
    // Inside pixel (3, 4)
    const filter = await makeFilter(lonLatBox(10.041, 49.961, 10.043, 49.963));

    const rows = await getSoilData(filter, [layer.dataset.slug], 100);

    expect(rows.map(row => [position(row), row.value])).toEqual([['3:4', Math.fround(INEXACT_VALUE)]]);
    expect(rows[0]!.value).toBe(6.286900043487549);
  });

  it('returns every pixel around a corner the AOI straddles, except nodata and NaN pixels', async () => {
    const layer = await addFixtureLayer('corner.tif');
    // Straddles the corner shared by pixels (0..1, 1..2): (1, 1) is nodata and (1, 2) is NaN
    const filter = await makeFilter(lonLatBox(10.019, 49.989, 10.021, 49.991));

    const rows = await getSoilData(filter, [layer.dataset.slug], 100);

    expect(rows.map(row => [position(row), row.value])).toEqual([
      ['0:1', 1.5],
      ['0:2', 2.5],
    ]);
  });

  it('labels the pixels of a categorical band that are class codes, and only those', async () => {
    // Offset by -0.5, row 0's pixels are the whole numbers 0..11
    const layer = await addFixtureLayer('categorical.tif', { offset: -0.5, soilProperty: 'Raster Rows Texture' });
    const entityManager = await getEntityManager();
    await entityManager.query(`UPDATE soil_properties SET classes = $1 WHERE id = $2`, [
      JSON.stringify({ '1': { label: 'Clay' }, '2': { label: 'Silty Clay', aliases: ['SiC'] } }),
      layer.soil_property.id,
    ]);
    // Touches row 0, columns 1..3
    const filter = await makeFilter(lonLatBox(10.011, 49.991, 10.031, 49.999));

    const rows = await getSoilData(filter, [layer.dataset.slug], 100);

    expect(rows.map(row => [position(row), row.value, row.value_label])).toEqual([
      ['0:1', 1, 'Clay'],
      ['0:2', 2, 'Silty Clay'],
      ['0:3', 3, null],
    ]);
  });

  it('pages through raster rows by Raster Layer, then pixel row, then column', async () => {
    const first = await addFixtureLayer('paging-a.tif');
    const second = await addFixtureLayer('paging-b.tif', { offset: 1000, soilProperty: 'Raster Rows Property B' });
    // Touches rows 0..2 and columns 0..3 of both layers
    const filter = await makeFilter(lonLatBox(10.005, 49.975, 10.035, 49.995));
    const slugs = [first.dataset.slug];

    const all = await getSoilData(filter, slugs, 200);
    const expectedPositions: string[] = [];
    for (let row = 0; row <= 2; row++) {
      for (let col = 0; col <= 3; col++) {
        if (!isInvalid(row, col)) expectedPositions.push(`${row}:${col}`);
      }
    }
    const [lower, upper] = [first, second].sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(all.map(row => `${row.id.split(':')[0]} ${position(row)}`)).toEqual([
      ...expectedPositions.map(p => `${lower!.id} ${p}`),
      ...expectedPositions.map(p => `${upper!.id} ${p}`),
    ]);

    // Pages of 3 cross row and layer boundaries mid-page and return the same rows in the same order
    const pages = await getAllPages(filter, slugs, 3);
    expect(pages.slice(0, -1).every(page => page.length === 3)).toBe(true);
    expect(pages.flat().map(row => row.id)).toEqual(all.map(row => row.id));
  });

  // 10 vector rows: pages of 7 switch to raster rows mid-page, pages of 5 right after a full vector page
  it.each([7, 5])('serves every vector row before the raster rows, under one cursor (pages of %i)', async limit => {
    const raster = await addFixtureLayer('mixed.tif');
    const { dataset: vector } = await addSyntheticData({
      ...syntheticDataOptions,
      spatial_extent: [10.01, 49.93, 10.11, 49.99],
      featureCount: 5,
      observationsPerLayer: 2,
    });
    const filter = await makeFilter(lonLatBox(ORIGIN_X, ORIGIN_Y - HEIGHT * RES, ORIGIN_X + WIDTH * RES, ORIGIN_Y));
    const slugs = [raster.dataset.slug, vector.slug];

    const pages = await getAllPages(filter, slugs, limit);
    const rows = pages.flat();

    const vectorRows = rows.filter(row => row.gis_datatype !== GISDataType.RASTER);
    const rasterRows = rows.filter(row => row.gis_datatype === GISDataType.RASTER);
    expect(vectorRows).toHaveLength(10);
    expect(rasterRows).toHaveLength(WIDTH * HEIGHT - 2);
    expect(rows.slice(0, vectorRows.length)).toEqual(vectorRows);
    expect(new Set(rows.map(row => row.id)).size).toBe(rows.length);
    expect(pages.slice(0, -1).every(page => page.length === limit)).toBe(true);
    // Vector rows keep their shape, and now say what kind of Dataset they come from
    for (const row of vectorRows) {
      expect(row.gis_datatype).toBe(GISDataType.POINT);
      expect(row.resolution_m).toBeNull();
      expect(row.reference_period_start).toBeNull();
      expect(row.reference_period_stop).toBeNull();
      expect(row.geometry.type).toBe('Point');
      expect(decodeCursor(row.cursor).raster).toBeUndefined();
    }
  });

  it('keeps the sort column on raster cursors, so the pagination stays checked against it', async () => {
    const raster = await addFixtureLayer('sorted.tif');
    const { dataset: vector } = await addSyntheticData({
      ...syntheticDataOptions,
      spatial_extent: [10.01, 49.93, 10.11, 49.99],
      featureCount: 3,
      useProgressiveObservationValues: true,
    });
    const filter = await makeFilter(lonLatBox(10.005, 49.925, 10.115, 49.995));
    const slugs = [raster.dataset.slug, vector.slug];

    const rows = (await getAllPages(filter, slugs, 4, '-value')).flat();
    const vectorValues = rows.filter(row => row.gis_datatype === GISDataType.POINT).map(row => row.value);
    expect(vectorValues).toEqual([...vectorValues].sort((a, b) => b - a));
    const rasterRow = rows.find(row => row.gis_datatype === GISDataType.RASTER)!;
    expect(decodeCursor(rasterRow.cursor).column).toBe('-value');

    await expect(getSoilData(filter, slugs, 4, rasterRow.cursor, 'value')).rejects.toThrow('Sort field is not matching cursor');
  });

  it.each<[string, (filter: FilterCriteria) => Promise<DataFilter>]>([
    ['the Filter has no geometries', async parameters => makeFilter(undefined, parameters)],
    ['the data types exclude raster', async () => makeFilter(lonLatBox(10.0, 49.92, 10.12, 50.0), { data_types: [GISDataType.POINT] })],
    [
      'the soil properties exclude the layer',
      async () => makeFilter(lonLatBox(10.0, 49.92, 10.12, 50.0), { soil_properties: ['some-other-property'] }),
    ],
    ['the depth range misses the layer', async () => makeFilter(lonLatBox(10.0, 49.92, 10.12, 50.0), { min_depth: 50 })],
    ['the AOI misses the layer', async () => makeFilter(lonLatBox(11, 49, 11.5, 49.5))],
  ])('returns no raster rows when %s', async (_, buildFilter) => {
    const layer = await addFixtureLayer('excluded.tif');
    const rows = await getSoilData(await buildFilter({}), [layer.dataset.slug], 100);
    expect(rows).toEqual([]);
  });

  it("reports the Raster Layer's procedure and its Dataset's licence", async () => {
    const layer = await addFixtureLayer('procedure.tif', { laboratoryMethod: 'Raster Rows Lab Method' });
    const license = await addLicense('Raster Rows Licence');
    const entityManager = await getEntityManager();
    await entityManager.query(`UPDATE datasets SET licenses = ARRAY[$1] WHERE id = $2`, [license.slug, layer.dataset.id]);

    const [row] = await getSoilData(await makeFilter(lonLatBox(10.031, 49.971, 10.033, 49.973)), [layer.dataset.slug], 100);

    expect(row?.laboratory_method).toBe('Raster Rows Lab Method');
    expect(row?.license_name).toBe('Raster Rows Licence');
  });

  it('reports the reference period a sampling-date criterion matched, with no sampling date', async () => {
    const layer = await addFixtureLayer('period.tif', { referencePeriod: ['2010', '2020-06'] });
    const filter = await makeFilter(lonLatBox(10.031, 49.971, 10.033, 49.973), { min_sampling_date: '2015-01-01' });

    const [row] = await getSoilData(filter, [layer.dataset.slug], 100);

    expect(row).toMatchObject({ sampling_date: null, reference_period_start: '2010', reference_period_stop: '2020-06' });
  });

  it('matches a reference period stopping in 2015 as the whole year, so a range from March 2015 reaches it', async () => {
    const layer = await addFixtureLayer('partial-period.tif', { referencePeriod: ['2010', '2015'] });
    const aoi = lonLatBox(10.031, 49.971, 10.033, 49.973);

    const reached = await getSoilData(await makeFilter(aoi, { min_sampling_date: '2015-03-01' }), [layer.dataset.slug], 100);
    const missed = await getSoilData(await makeFilter(aoi, { min_sampling_date: '2016-01-01' }), [layer.dataset.slug], 100);

    expect(reached.map(row => row.reference_period_stop)).toEqual(['2015']);
    expect(missed).toEqual([]);
  });

  it("reports the coverage summary's latest stop by when each period ends, not by text", async () => {
    await addFixtureLayer('stop-year.tif', { referencePeriod: ['2010', '2015'] });
    await addFixtureLayer('stop-day.tif', {
      offset: 1000,
      soilProperty: 'Raster Rows Property B',
      referencePeriod: ['2010', '2015-06-01'],
    });

    const [summary] = await sds.filterRaster(await getEntityManager(), await makeFilter(lonLatBox(10.031, 49.971, 10.033, 49.973)));

    expect(summary?.max_sampling_date).toBe('2015');
  });

  /** A raster and a vector Dataset at `status`, both meeting the fixture's footprint. */
  const addBothKinds = async (fixture: string, status: IngestionStatus) => {
    const raster = await addFixtureLayer(fixture, { status });
    const { dataset: vector } = await addSyntheticData({
      ...syntheticDataOptions,
      spatial_extent: [10.01, 49.93, 10.11, 49.99],
      featureCount: 2,
    });
    await (await getEntityManager()).query(`UPDATE datasets SET status = $1 WHERE id = $2`, [status, vector.id]);
    return [raster.dataset.slug, vector.slug];
  };
  const fixtureBox = () => lonLatBox(ORIGIN_X, ORIGIN_Y - HEIGHT * RES, ORIGIN_X + WIDTH * RES, ORIGIN_Y);

  it.each<[string, FilterCriteria, IngestionStatus, Token | undefined]>([
    ['Datasets that are not Published, to a Privileged caller', {}, IngestionStatus.LOADED, { isDataAdmin: true } as Token],
    ['a visibility criterion the Datasets do not match', { visibility: 'private' }, IngestionStatus.PUBLISHED, undefined],
    ['an empty data types list', { data_types: [] }, IngestionStatus.PUBLISHED, undefined],
  ])('applies the dataset-level rules of vector rows: %s still yield both kinds of rows', async (_, parameters, status, token) => {
    const slugs = await addBothKinds('parity.tif', status);
    const filter = await makeFilter(fixtureBox(), parameters);

    const requestData = { entityManager: await getEntityManager(), entitlements, ...(token && { token }) };
    const rows = await sds.getSoilData(requestData, filter, slugs, 200);

    expect(rows.filter(row => row.gis_datatype === GISDataType.POINT)).toHaveLength(2);
    expect(rows.filter(row => row.gis_datatype === GISDataType.RASTER)).toHaveLength(WIDTH * HEIGHT - 2);
  });

  it('yields neither kind of row from Datasets that are not Published to a non-privileged caller (docs/adr/0057)', async () => {
    const slugs = await addBothKinds('unpublished.tif', IngestionStatus.LOADED);
    const filter = await makeFilter(fixtureBox());

    expect(await getSoilData(filter, slugs, 200)).toEqual([]);
  });

  it('rejects a cursor with a malformed raster position', async () => {
    const layer = await addFixtureLayer('cursor.tif');
    const filter = await makeFilter(lonLatBox(10.0, 49.92, 10.12, 50.0));
    const cursor = encodeCursor({ id: 'x', raster: { layer: 'not-a-uuid', row: 0, col: 0 } });
    await expect(getSoilData(filter, [layer.dataset.slug], 100, cursor)).rejects.toThrow('Cursor decoding failure');
  });

  it('skips a Raster Layer whose File cannot be read, with a warning, and serves the others', async () => {
    const unreadable = await addFixtureLayer('unreadable.tif');
    const readable = await addFixtureLayer('readable.tif', { offset: 1000, soilProperty: 'Raster Rows Property B' });
    await (
      await getEntityManager()
    ).query(`UPDATE files SET file_path = 'missing/unreadable.tif' WHERE id = (SELECT file_id FROM raster_layers WHERE id = $1)`, [
      unreadable.id,
    ]);
    const warnSpy = jest.spyOn(log, 'warn');

    try {
      const rows = await getSoilData(await makeFilter(lonLatBox(10.031, 49.971, 10.033, 49.973)), [unreadable.dataset.slug], 100);

      expect(rows.map(row => row.id)).toEqual([`${readable.id}:2:3`]);
      expect(warnSpy).toHaveBeenCalledWith(
        'Raster Layer could not be sampled; skipping it',
        expect.objectContaining({ layerId: unreadable.id }),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('stops reading pixels once the client disconnects', async () => {
    const layer = await addFixtureLayer('disconnected.tif');
    const controller = new AbortController();
    controller.abort(new Error('client disconnected'));
    const filter = await makeFilter(lonLatBox(10.031, 49.971, 10.033, 49.973));

    await expect(
      sds.getSoilData(
        { entityManager: await getEntityManager(), entitlements, signal: controller.signal },
        filter,
        [layer.dataset.slug],
        100,
      ),
    ).rejects.toThrow('client disconnected');
  });

  it('reprojects for a projected Raster Layer: the AOI into its CRS, the pixel outline back to EPSG:4326', async () => {
    const tif = writableAsset('raster/epsg3857_2b_250m.tif');
    const layer = await addRasterData(tif, {
      dataset: 'raster-rows-3857',
      dataset_status: IngestionStatus.PUBLISHED,
      visibility: 'public',
    });
    // Band 1 is valid here (gdallocationinfo reads 55)
    const [lon, lat] = [-80.9, -33.8];
    const aoi = lonLatBox(lon - 0.0002, lat - 0.0002, lon + 0.0002, lat + 0.0002);

    const rows = await getSoilData(await makeFilter(aoi), [layer.dataset.slug], 100);

    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const row of rows) {
      expect(row.geometry.type).toBe('Polygon');
      expect(turf.booleanIntersects(row.geometry, aoi)).toBe(true);
      // ~252 m in Web Mercator at 33.7°S
      expect(turf.area(row.geometry)).toBeGreaterThan(150 * 150);
      expect(turf.area(row.geometry)).toBeLessThan(260 * 260);
    }
    const atCentre = rows.find(row => turf.booleanPointInPolygon([lon, lat], row.geometry))!;
    const expected = Number(
      execFileSync('gdallocationinfo', ['-valonly', '-b', '1', '-wgs84', tif, String(lon), String(lat)])
        .toString()
        .trim(),
    );
    expect(atCentre.value).toBe(expected);
  });

  describe('with raster filters', () => {
    // An island in the raster filter tables' test tile: land_cover 30 among other classes, sea (200)
    // around it, and no class 40. The default fixture has valid pixels over part of it.
    const aoi = getPolygonFromBbox([-80.79, -33.8, -80.72, -33.7]);

    it.each([
      [[30], true],
      [[40], false],
    ])('takes the AOI as the geometries intersected with land_cover %j (rows: %s)', async (values, expectRows) => {
      const layer = await addRasterData(undefined, {
        dataset: 'raster-rows-filtered',
        dataset_status: IngestionStatus.PUBLISHED,
        visibility: 'public',
      });
      await addRasterFilterData();
      await addRasterFilterMappings();

      const unfiltered = (await getAllPages(await makeFilter(aoi), [layer.dataset.slug], 200)).flat();
      const rows = (await getAllPages(await makeFilter(aoi, { raster_filters: { land_cover: values } }), [layer.dataset.slug], 200)).flat();

      expect(unfiltered.length).toBeGreaterThan(0);
      if (expectRows) {
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.length).toBeLessThan(unfiltered.length);
        const unfilteredIds = new Set(unfiltered.map(row => row.id));
        expect(rows.every(row => unfilteredIds.has(row.id))).toBe(true);
      } else {
        expect(rows).toEqual([]);
      }
    });
  });
});
