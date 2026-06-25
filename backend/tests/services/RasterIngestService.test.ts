import { describe, it, expect, beforeEach } from '@jest/globals';
import path from 'path';
import { ingestRaster } from '../../src/services/RasterIngestService';
import { getDataSource } from '../../src/utils/data-source';

const rasterAssetsPath = path.join(__dirname, '../assets/raster');
const TEST_FILE = 'bdod_5-15cm_mean.tif';

describe('RasterIngestService', () => {
  describe('ingestRaster - local storage', () => {
    beforeEach(() => {
      process.env.STORAGE_MODE = 'local';
      process.env.LOCAL_STORAGE_ROOT_FOLDER = rasterAssetsPath;
    });

    it('creates a raster_layer record with footprints', async () => {
      const result = await ingestRaster({
        input: TEST_FILE,
        dataset: 'test-raster-local',
        soilProperty: 'Bulk Density',
        soilPropertyCategory: 'Physical',
      });

      expect(result).toBe(TEST_FILE);

      const ds = await getDataSource();
      const layers = await ds.query(`SELECT id, resolution_m FROM raster_layers`);
      expect(layers).toHaveLength(1);
      expect(layers[0].resolution_m).toBeGreaterThan(0);

      const [{ count }] = await ds.query(`SELECT COUNT(*) AS count FROM raster_layer_footprints WHERE raster_layer_id = $1`, [
        layers[0].id,
      ]);
      expect(parseInt(count, 10)).toBeGreaterThan(0);
    });
  });

  describe('ingestRaster - S3 storage', () => {
    beforeEach(() => {
      process.env.STORAGE_MODE = 's3';
    });

    it('creates a raster_layer record with footprints', async () => {
      const result = await ingestRaster({
        input: `raster/${TEST_FILE}`,
        dataset: 'test-raster-s3',
        soilProperty: 'Bulk Density',
        soilPropertyCategory: 'Physical',
      });

      expect(result).toBe(TEST_FILE);

      const ds = await getDataSource();
      const layers = await ds.query(`SELECT id, resolution_m FROM raster_layers`);
      expect(layers).toHaveLength(1);
      expect(layers[0].resolution_m).toBeGreaterThan(0);

      const [{ count }] = await ds.query(`SELECT COUNT(*) AS count FROM raster_layer_footprints WHERE raster_layer_id = $1`, [
        layers[0].id,
      ]);
      expect(parseInt(count, 10)).toBeGreaterThan(0);
    });
  });
});
