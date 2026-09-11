import { describe, it, expect, beforeEach } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { MultiPolygon } from 'geojson';
import { streamRasterFootprints } from '../../src/scripts/computeRasterFootprints';

const rasterAssetsPath = path.join(__dirname, '../assets/raster');
// Float32 band whose GDAL_NODATA tag is the text "-3.4e+38"
const NODATA_F32_FILE = 'nodata_34e38_f32.tif';
// Lambert Azimuthal Equal Area, no EPSG code — exercises the srcSrs-detection path and
// gdal_footprint's own -t_srs reprojection, not gdaltransform.
const CUSTOM_CRS_FILE = 'epsg8807_1b_250m.tif';

// gdal_translate/gdal_footprint temp artifacts this module creates in os.tmpdir(); scoped by
// prefix so unrelated files already present there don't produce false positives.
async function listFootprintTempFiles(): Promise<string[]> {
  const entries = await fs.readdir(os.tmpdir()).catch(() => [] as string[]);
  return entries.filter(name => name.startsWith('footprint-overview-') || name.startsWith('footprint-tile-'));
}

describe('streamRasterFootprints', () => {
  beforeEach(() => {
    process.env.STORAGE_MODE = 'local';
    process.env.LOCAL_STORAGE_ROOT_FOLDER = rasterAssetsPath;
  });

  it('excludes float32 nodata pixels even when gdalinfo reports the sentinel as an imprecise decimal', async () => {
    const batches: MultiPolygon[][] = [];
    let totalTiles = 0;

    await streamRasterFootprints(
      NODATA_F32_FILE,
      1,
      async tiles => {
        batches.push(tiles);
      },
      async (_tilesProcessed, total) => {
        totalTiles = total;
      },
    );

    const footprints = batches.flat();
    expect(footprints.length).toBeGreaterThan(0);
    expect(totalTiles).toBeGreaterThan(0);

    expect(footprints.length).toBeLessThan(totalTiles * 0.9);
  });

  it('reprojects footprints to EPSG:4326 for a source in a custom, unregistered CRS', async () => {
    const batches: MultiPolygon[][] = [];

    await streamRasterFootprints(CUSTOM_CRS_FILE, 1, async tiles => {
      batches.push(tiles);
    });

    const footprints = batches.flat();
    expect(footprints.length).toBeGreaterThan(0);

    // The source CRS is metres-based (Lambert Azimuthal Equal Area); coordinates in the
    // hundreds of thousands would mean gdal_footprint's -t_srs EPSG:4326 never applied.
    for (const { coordinates } of footprints) {
      for (const polygon of coordinates) {
        for (const ring of polygon) {
          for (const [lon, lat] of ring) {
            expect(lon).toBeGreaterThanOrEqual(-180);
            expect(lon).toBeLessThanOrEqual(180);
            expect(lat).toBeGreaterThanOrEqual(-90);
            expect(lat).toBeLessThanOrEqual(90);
          }
        }
      }
    }
  });

  it('leaves no temp files behind in os.tmpdir() after a successful run', async () => {
    const before = await listFootprintTempFiles();

    await streamRasterFootprints(NODATA_F32_FILE, 1, async () => {});

    const after = await listFootprintTempFiles();
    expect(after).toEqual(before);
  });
});
