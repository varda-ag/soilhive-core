import { describe, it, expect, beforeEach } from '@jest/globals';
import path from 'path';
import type { MultiPolygon } from 'geojson';
import { streamRasterFootprints } from '../../src/scripts/computeRasterFootprints';

const rasterAssetsPath = path.join(__dirname, '../assets/raster');
// Float32 band whose GDAL_NODATA tag is the text "-3.4e+38"
const NODATA_F32_FILE = 'nodata_34e38_f32.tif';

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
});
