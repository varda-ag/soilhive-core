import { describe, it, expect, beforeEach } from '@jest/globals';
import { analyzeRasterMeta, isMetricProjectedCrs, selectOverviewTable } from '../../src/utils/raster';
import { writableAssets } from '../assets';

const rasterAssetsPath = writableAssets('raster');
// Same fixture as RasterLoader.test.ts: a valid COG, but in EPSG:3857 rather than EPSG:4326.
const EPSG3857_FILE = 'epsg3857_2b_250m.tif';
// Interrupted Goode Homolosine CRS layer
const HOMOLOSINE_FILE = 'homolosine_1b_250m.tif';

describe('analyzeRasterMeta', () => {
  beforeEach(() => {
    process.env.STORAGE_MODE = 'local';
    process.env.LOCAL_STORAGE_ROOT_FOLDER = rasterAssetsPath;
  });

  it('reprojects the bbox to EPSG:4326 for a raster stored in a different CRS', async () => {
    const { bbox } = await analyzeRasterMeta(EPSG3857_FILE, 1);

    // Native (EPSG:3857) extent is roughly x: -9034970..-8957245, y: -4030746..-3952517 — metres
    // in the millions. A bbox still in those units, merely mislabelled as EPSG:4326, would fail
    // every one of these bounds; only a real reprojection lands within valid lon/lat ranges here.
    const [sw, , ne] = bbox.coordinates[0]!;
    expect(sw![0]).toBeCloseTo(-81.1625158147591, 6);
    expect(sw![1]).toBeCloseTo(-34.01447939602, 6);
    expect(ne![0]).toBeCloseTo(-80.4643007812001, 6);
    expect(ne![1]).toBeCloseTo(-33.4299806691591, 6);
  });

  it('leaves the bbox as-is for a raster already in EPSG:4326', async () => {
    const { bbox } = await analyzeRasterMeta('multiband_2b_250m.tif', 1);

    // gdalinfo reports this fixture's own extent as Upper Left (-81.1625158,-33.4299807),
    // Lower Right (-80.4645993,-34.0153972) — no transform should move these at all.
    const [sw, , ne] = bbox.coordinates[0]!;
    expect(sw![0]).toBeCloseTo(-81.1625158, 6);
    expect(sw![1]).toBeCloseTo(-34.0153972, 6);
    expect(ne![0]).toBeCloseTo(-80.4645993, 6);
    expect(ne![1]).toBeCloseTo(-33.4299807, 6);
  });

  it('computes resolution in metres for a geographic (degrees) CRS', async () => {
    const { resolution } = await analyzeRasterMeta('multiband_2b_250m.tif', 1);
    expect(resolution).toBeGreaterThan(150);
    expect(resolution).toBeLessThan(350);
  });

  it('computes resolution in metres for a projected (WKT2 PROJCRS) CRS, not degrees-as-metres', async () => {
    const { resolution } = await analyzeRasterMeta(EPSG3857_FILE, 1);
    expect(resolution).toBeGreaterThan(100);
    expect(resolution).toBeLessThan(252);
  });

  it('measures ground distance rather than trusting the axis unit for a projected CRS whose unit happens to be metres', async () => {
    const { resolution } = await analyzeRasterMeta(EPSG3857_FILE, 1);
    expect(resolution).toBeCloseTo(210, -1);
  });

  it("falls back to the CRS axis unit when a corner can't be reprojected", async () => {
    const { resolution } = await analyzeRasterMeta(HOMOLOSINE_FILE, 1);
    // Its WKT declares LENGTHUNIT["metre",1], and its pixel width is 250 native units
    expect(resolution).toBe(250);
  });

  it("falls back to the whole globe when gdalinfo can't determine a WGS84 extent at all", async () => {
    const { bbox } = await analyzeRasterMeta(HOMOLOSINE_FILE, 1);
    expect(bbox).toEqual({
      type: 'Polygon',
      coordinates: [
        [
          [-180, -90],
          [180, -90],
          [180, 90],
          [-180, 90],
          [-180, -90],
        ],
      ],
    });
  });
});

describe('isMetricProjectedCrs', () => {
  it('is true for a WKT2 LENGTHUNIT of exactly 1 metre', () => {
    expect(isMetricProjectedCrs('LENGTHUNIT["metre",1,ID["EPSG",9001]]')).toBe(true);
  });

  it('is true for a WKT1 UNIT of exactly 1 metre', () => {
    expect(isMetricProjectedCrs('UNIT["metre",1]')).toBe(true);
  });

  it('is true for the American spelling', () => {
    expect(isMetricProjectedCrs('LENGTHUNIT["meter",1]')).toBe(true);
  });

  it('is false for a non-metre unit (e.g. state-plane feet)', () => {
    expect(isMetricProjectedCrs('LENGTHUNIT["US survey foot",0.304800609601219]')).toBe(false);
  });

  it('is false when the unit is named "metre" but the factor is not 1', () => {
    expect(isMetricProjectedCrs('LENGTHUNIT["metre",0.9996]')).toBe(false);
  });

  it('is false for no WKT', () => {
    expect(isMetricProjectedCrs(undefined)).toBe(false);
  });
});

describe('raster tests', () => {
  it.each([
    [1_000_000, 'raster'], // Cultivated field (1 Km2)
    [2_000_000, 'raster'],
    [25_000_000, 'o_2_raster'], // 5x5 Km2
    [100_000_000, 'o_4_raster'],
    [500_000_000, 'o_8_raster'],
    [600_000_000, 'o_8_raster'], // City of Madrid
    [700_000_000, 'o_8_raster'],
    [1_000_000_000, 'o_8_raster'],
    [5_000_000_000, 'o_16_raster'],
    [22_000_000_000, 'o_32_raster'], // Emilia Romagna
    [300_000_000_000, 'o_32_raster'], // Italy
    [10_000_000_000_000, 'o_32_raster'], // USA
  ])('selectOverviewTable should work as expected', (aoiM2, expected) => {
    const baseTable = 'raster';
    const table = selectOverviewTable(baseTable, aoiM2);
    expect(table).toEqual(expected);
  });
});
