import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { execFileSync } from 'child_process';
import path from 'path';
import { analyzeRasterMeta, isMetricProjectedCrs, selectOverviewTable } from '../../src/utils/raster';
import { GdalCLI } from '../../src/utils/GdalCLI';
import { writableAssets } from '../assets';

const rasterAssetsPath = writableAssets('raster');
// Same fixture as RasterLoader.test.ts: a valid COG, but in EPSG:3857 rather than EPSG:4326.
const EPSG3857_FILE = 'epsg3857_2b_250m.tif';
// Interrupted Goode Homolosine (ESRI:54052): a 4x4 tile from the top-left corner of SoilGrids'
// global extent, entirely off the globe.
const HOMOLOSINE_FILE = 'homolosine_1b_250m.tif';
// The fixtures below are warped from a constant EPSG:4326 raster with
// `gdalwarp -t_srs <crs> -te <extent> -tr <res> -dstnodata 255`, which leaves whatever falls in a
// gap between the projection's lobes, or off the globe, as nodata — as it is in SoilGrids.
// ESRI:54052, -te -17000000 6000000 -13000000 8000000 -tr 100000 100000: both left corners off the
// globe.
const HOMOLOSINE_PARTIAL_FILE = 'homolosine_partial_1b_100km.tif';
// ESRI:54052, -te -8000000 5500000 -500000 6500000 -tr 50000 50000: centred on the gap at 40°W,
// with every corner on land either side of it.
const HOMOLOSINE_GAP_FILE = 'homolosine_gap_1b_50km.tif';
// The same in US survey feet, `+proj=igh +datum=WGS84 +units=us-ft`,
// -te -26000000 18000000 -2000000 21000000 -tr 200000 200000.
const HOMOLOSINE_GAP_FTUS_FILE = 'homolosine_gap_ftus_1b.tif';

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

  it("builds the bbox from a lattice across the raster when gdalinfo's wgs84Extent is missing corners", async () => {
    // gdalinfo drops both left corners, leaving a "ring" of the two on the right edge alone
    const info = await GdalCLI.gdalinfo(path.join(rasterAssetsPath, HOMOLOSINE_PARTIAL_FILE));
    expect(info.wgs84Extent?.coordinates[0]).toHaveLength(2);

    const { bbox } = await analyzeRasterMeta(HOMOLOSINE_PARTIAL_FILE, 1);

    // That ring's own envelope stops at 148.8°W, missing the western 30° of the raster
    const [sw, , ne] = bbox.coordinates[0]!;
    expect(sw![0]).toBeLessThan(-175);
    expect(sw![1]).toBeCloseTo(54.5053185, 6);
    expect(ne![0]).toBeCloseTo(-126.1908137, 6);
    expect(ne![1]).toBeCloseTo(77.2286092, 6);
  });

  it("measures resolution at the raster's centre rather than at a corner that can't be reprojected", async () => {
    const { resolution } = await analyzeRasterMeta(HOMOLOSINE_PARTIAL_FILE, 1);
    // Its top-left corner is off the globe. The centre, at ~65°N, is in the projection's Mollweide
    // zone, which isn't true to scale along a parallel: one 100 km pixel spans ~81 km there.
    expect(resolution).toBeCloseTo(80_700, -2);
  });

  it("falls back to the native pixel width when the centre can't be reprojected and the axis unit is metres", async () => {
    const { resolution } = await analyzeRasterMeta(HOMOLOSINE_GAP_FILE, 1);
    expect(resolution).toBe(50_000);
  });

  it("stores resolution as unavailable when the centre can't be reprojected and the axis unit isn't metres", async () => {
    // Its WKT2 still carries a LENGTHUNIT["metre",1], on the WGS 84 ellipsoid
    const { resolution, wkt } = await analyzeRasterMeta(HOMOLOSINE_GAP_FTUS_FILE, 1);
    expect(wkt).toContain('LENGTHUNIT["metre",1]');
    expect(resolution).toBe(-1);
  });

  it('rejects a raster with no point that reprojects to EPSG:4326, rather than storing a made-up bbox', async () => {
    await expect(analyzeRasterMeta(HOMOLOSINE_FILE, 1)).rejects.toThrow(/reprojects to EPSG:4326/);
  });

  it('propagates a failure to run gdaltransform rather than storing a guessed resolution', async () => {
    const transformSpy = jest
      .spyOn(GdalCLI, 'transformPoints')
      .mockRejectedValueOnce(new Error('GDAL_NOT_INSTALLED: gdaltransform not found on this server'));
    try {
      await expect(analyzeRasterMeta(EPSG3857_FILE, 1)).rejects.toThrow(/GDAL_NOT_INSTALLED/);
    } finally {
      transformSpy.mockRestore();
    }
  });
});

describe('isMetricProjectedCrs', () => {
  // Real WKT as GDAL writes it. gdalinfo reports WKT2_2019, which carries the ellipsoid's own
  // LENGTHUNIT["metre",1] even for a CRS whose coordinates are in feet.
  const wktOf = (crs: string, format: string): string => execFileSync('gdalsrsinfo', ['-o', format, crs]).toString();

  describe.each(['wkt2_2019', 'wkt1', 'wkt_esri'])('from %s', format => {
    it.each([
      ['EPSG:3857', true], // Web Mercator
      ['EPSG:32633', true], // UTM zone 33N
      ['ESRI:54052', true], // Interrupted Goode Homolosine
      ['EPSG:7405', true], // British National Grid + ODN height: a compound CRS, with a vertical axis too
      ['EPSG:2263', false], // NAD83 / New York Long Island, in US survey feet
      ['+proj=utm +zone=33 +datum=WGS84 +units=km', false], // metric, but not metres
    ])('%s is %s', (crs, expected) => {
      expect(isMetricProjectedCrs(wktOf(crs, format))).toBe(expected);
    });
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
