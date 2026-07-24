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

      const [dataset] = await ds.query(`SELECT spatial_resolution, variables_measured FROM datasets WHERE name = $1`, [
        'test-raster-local',
      ]);
      expect(dataset.spatial_resolution).toBe(`${layers[0].resolution_m}m`);

      const [{ slug }] = await ds.query(`SELECT slug FROM soil_properties WHERE property_name = $1`, ['Bulk Density']);
      expect(dataset.variables_measured).toEqual([{ soil_property_id: slug, procedure_id: null }]);
    });

    it('accumulates distinct entries in variables_measured as new soil properties are ingested into the same dataset', async () => {
      const datasetName = 'test-raster-variables';
      await ingestRaster({
        input: TEST_FILE,
        dataset: datasetName,
        soilProperty: 'Bulk Density',
        soilPropertyCategory: 'Physical',
      });
      await ingestRaster({
        input: TEST_FILE,
        dataset: datasetName,
        soilProperty: 'Sand Content',
        soilPropertyCategory: 'Physical',
      });

      const ds = await getDataSource();
      const [{ slug: bulkDensitySlug }] = await ds.query(`SELECT slug FROM soil_properties WHERE property_name = $1`, ['Bulk Density']);
      const [{ slug: sandContentSlug }] = await ds.query(`SELECT slug FROM soil_properties WHERE property_name = $1`, ['Sand Content']);

      const [dataset] = await ds.query(`SELECT variables_measured FROM datasets WHERE name = $1`, [datasetName]);
      expect(dataset.variables_measured).toHaveLength(2);
      expect(dataset.variables_measured).toEqual(
        expect.arrayContaining([
          { soil_property_id: bulkDensitySlug, procedure_id: null },
          { soil_property_id: sandContentSlug, procedure_id: null },
        ]),
      );
    });

    it('stores an out-of-range float32 nodata sentinel as null instead of failing the insert', async () => {
      const result = await ingestRaster({
        input: TEST_FILE,
        dataset: 'test-raster-nodata-clamp',
        soilProperty: 'Bulk Density',
        soilPropertyCategory: 'Physical',
        nodata: -3.4e38,
      });

      expect(result).toBe(TEST_FILE);

      const ds = await getDataSource();
      const layers = await ds.query(`SELECT nodata_value FROM raster_layers`);
      expect(layers).toHaveLength(1);
      expect(layers[0].nodata_value).toBeNull();
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

      const [dataset] = await ds.query(`SELECT spatial_resolution FROM datasets WHERE name = $1`, ['test-raster-s3']);
      expect(dataset.spatial_resolution).toBe(`${layers[0].resolution_m}m`);
    });
  });
});
