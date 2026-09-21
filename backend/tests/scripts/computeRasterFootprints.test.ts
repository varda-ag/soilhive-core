import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { MultiPolygon } from 'geojson';
import { streamRasterFootprints } from '../../src/scripts/computeRasterFootprints';
import { GdalCLI } from '../../src/utils/GdalCLI';
import { writableAssets } from '../assets';

const rasterAssetsPath = writableAssets('raster');
// Float32 band whose GDAL_NODATA tag is the text "-3.4e+38"
const NODATA_F32_FILE = 'nodata_34e38_f32.tif';
// Lambert Azimuthal Equal Area, no EPSG code — exercises the srcSrs-detection path and
// gdal_footprint's own -t_srs reprojection, not gdaltransform.
const CUSTOM_CRS_FILE = 'epsg8807_1b_250m.tif';

/** A gdal_translate/gdal_footprint temp artifact this module creates directly in os.tmpdir(). */
const isFootprintTempFile = (p: string): boolean => path.dirname(p) === os.tmpdir() && path.basename(p).startsWith('footprint-');

const exists = (p: string): Promise<boolean> =>
  fs
    .access(p)
    .then(() => true)
    .catch(() => false);

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
    // os.tmpdir() is the whole Jest worker's scratch directory, shared with every other suite the
    // worker has run and with any background work they left in flight - and a footprint run keeps
    // FOOTPRINT_CONCURRENCY tile VRTs alive at a time, so listing the directory before and after
    // picks up whichever tiles a concurrent run happens to have open and fails at random.
    // Track the paths this run creates instead: GdalCLI.translate writes the overview and the
    // reference VRT, and every tile VRT is handed to GdalCLI.footprint.
    const translateSpy = jest.spyOn(GdalCLI, 'translate');
    const footprintSpy = jest.spyOn(GdalCLI, 'footprint');
    let created: string[];
    try {
      await streamRasterFootprints(NODATA_F32_FILE, 1, async () => {});
      created = [...translateSpy.mock.calls.map(([, dst]) => dst), ...footprintSpy.mock.calls.map(([src]) => src)].filter(
        isFootprintTempFile,
      );
    } finally {
      translateSpy.mockRestore();
      footprintSpy.mockRestore();
    }

    // Guards the assertion below against passing vacuously if the module stops routing its temp
    // files through these two calls.
    expect(created.length).toBeGreaterThan(0);

    const surviving: string[] = [];
    for (const file of new Set(created)) {
      if (await exists(file)) surviving.push(file);
    }
    expect(surviving).toEqual([]);
  });
});
