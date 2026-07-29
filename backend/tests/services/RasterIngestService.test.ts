import { describe, it, expect, beforeEach } from '@jest/globals';
import path from 'path';
import { ingestRaster } from '../../src/services/RasterIngestService';
import { updateRasterDatasetMetadata } from '../../src/jobs/raster-load/UpdateDatasetMetadata';
import { getDataSource, getEntityManager } from '../../src/utils/data-source';
import { addCategory, addDataset, addFile, addSoilProperty } from '../../src/utils/mock';
import { GISDataType, IngestionStatus } from '../../src/types/data';

const rasterAssetsPath = path.join(__dirname, '../assets/raster');
const TEST_FILE = 'bdod_5-15cm_mean.tif';
// Two bands with non-overlapping value ranges whose valid data sits in opposite halves:
// band 1 covers the west (10..77), band 2 the east (172..240). A wrong-band read is therefore
// visible both in the values and in where the footprints land.
const MULTIBAND_FILE = 'multiband_2b_250m.tif';

const setUpDataset = async (datasetName: string, filePath: string, propertyName = 'Bulk Density') => {
  const dataset = await addDataset(datasetName, [-180, -90, 180, 90], GISDataType.RASTER);
  const category = await addCategory(`category-${datasetName}`);
  const property = await addSoilProperty(propertyName, category.id);
  const file = await addFile(filePath);
  return { dataset, property, file };
};

describe('RasterIngestService', () => {
  describe('ingestRaster - local storage', () => {
    beforeEach(() => {
      process.env.STORAGE_MODE = 'local';
      process.env.LOCAL_STORAGE_ROOT_FOLDER = rasterAssetsPath;
    });

    it('creates a raster_layer record with footprints and returns its id', async () => {
      const { dataset, property, file } = await setUpDataset('test-raster-local', TEST_FILE);

      const rasterLayerId = await ingestRaster({
        fileId: file.id,
        band: 1,
        datasetId: dataset.id,
        soilPropertySlug: property.slug,
        minDepth: 5,
        maxDepth: 15,
      });

      const ds = await getDataSource();
      const layers = await ds.query(`SELECT id, band, resolution_m, min_depth, max_depth FROM raster_layers`);
      expect(layers).toHaveLength(1);
      expect(layers[0].id).toBe(rasterLayerId);
      expect(layers[0].band).toBe(1);
      expect(layers[0].resolution_m).toBeGreaterThan(0);
      expect(layers[0].min_depth).toBe(5);
      expect(layers[0].max_depth).toBe(15);

      const [{ count }] = await ds.query(`SELECT COUNT(*) AS count FROM raster_layer_footprints WHERE raster_layer_id = $1`, [
        rasterLayerId,
      ]);
      expect(parseInt(count, 10)).toBeGreaterThan(0);
    });

    it('writes nothing at dataset level — that is the metadata step, not the ingest', async () => {
      const { dataset, property, file } = await setUpDataset('test-raster-no-dataset-writes', TEST_FILE);

      await ingestRaster({
        fileId: file.id,
        band: 1,
        datasetId: dataset.id,
        soilPropertySlug: property.slug,
        minDepth: null,
        maxDepth: null,
      });

      const ds = await getDataSource();
      const [row] = await ds.query(`SELECT spatial_resolution, variables_measured, n_raster_layers FROM datasets WHERE id = $1`, [
        dataset.id,
      ]);
      expect(row.spatial_resolution).toBeNull();
      expect(row.variables_measured).toBeNull();
      expect(row.n_raster_layers).toBeNull();
    });

    it('registers each band of a multiband file as its own layer, with its own footprints', async () => {
      const { dataset, property, file } = await setUpDataset('test-raster-multiband', MULTIBAND_FILE);

      const band1 = await ingestRaster({
        fileId: file.id,
        band: 1,
        datasetId: dataset.id,
        soilPropertySlug: property.slug,
        minDepth: 0,
        maxDepth: 5,
      });
      const band2 = await ingestRaster({
        fileId: file.id,
        band: 2,
        datasetId: dataset.id,
        soilPropertySlug: property.slug,
        minDepth: 5,
        maxDepth: 15,
      });

      expect(band1).not.toBe(band2);

      const ds = await getDataSource();
      const layers = await ds.query(`SELECT id, band FROM raster_layers WHERE file_id = $1 ORDER BY band`, [file.id]);
      expect(layers.map(l => l.band)).toEqual([1, 2]);

      // The two bands' valid data occupies opposite halves of the raster, so their footprints
      // must not coincide — identical footprints would mean both reads hit the same band.
      const [{ centroid_x: band1X }] = await ds.query(
        `SELECT ST_X(ST_Centroid(ST_Collect(rf.geom))) AS centroid_x
         FROM raster_layer_footprints rlf JOIN raster_footprints rf ON rf.id = rlf.raster_footprint_id
         WHERE rlf.raster_layer_id = $1`,
        [band1],
      );
      const [{ centroid_x: band2X }] = await ds.query(
        `SELECT ST_X(ST_Centroid(ST_Collect(rf.geom))) AS centroid_x
         FROM raster_layer_footprints rlf JOIN raster_footprints rf ON rf.id = rlf.raster_footprint_id
         WHERE rlf.raster_layer_id = $1`,
        [band2],
      );
      expect(Number(band1X)).toBeLessThan(Number(band2X));
    });

    it('is idempotent per (file, band): re-ingesting updates the layer instead of adding a sibling', async () => {
      const { dataset, property, file } = await setUpDataset('test-raster-idempotent', TEST_FILE);

      const first = await ingestRaster({
        fileId: file.id,
        band: 1,
        datasetId: dataset.id,
        soilPropertySlug: property.slug,
        minDepth: 0,
        maxDepth: 5,
      });
      const second = await ingestRaster({
        fileId: file.id,
        band: 1,
        datasetId: dataset.id,
        soilPropertySlug: property.slug,
        minDepth: 15,
        maxDepth: 30,
      });

      expect(second).toBe(first);

      const ds = await getDataSource();
      const layers = await ds.query(`SELECT id, min_depth, max_depth FROM raster_layers WHERE file_id = $1`, [file.id]);
      expect(layers).toHaveLength(1);
      expect(layers[0].min_depth).toBe(15);
      expect(layers[0].max_depth).toBe(30);
    });

    it('rejects a band whose values are not already in the property standard unit', async () => {
      const { dataset, property, file } = await setUpDataset('test-raster-unit', TEST_FILE);

      await expect(
        ingestRaster({
          fileId: file.id,
          band: 1,
          datasetId: dataset.id,
          soilPropertySlug: property.slug,
          minDepth: null,
          maxDepth: null,
          standardUnit: 'mg/kg',
          originalUnit: 'g/kg',
          conversionFormula: 'x*1000',
        }),
      ).rejects.toMatchObject({ code: 'RL_UNIT_NOT_STANDARD' });
    });
  });

  describe('updateRasterDatasetMetadata', () => {
    beforeEach(() => {
      process.env.STORAGE_MODE = 'local';
      process.env.LOCAL_STORAGE_ROOT_FOLDER = rasterAssetsPath;
    });

    it('rolls dataset metadata up from the raster layers', async () => {
      const { dataset, property, file } = await setUpDataset('test-raster-metadata', MULTIBAND_FILE);

      await ingestRaster({
        fileId: file.id,
        band: 1,
        datasetId: dataset.id,
        soilPropertySlug: property.slug,
        minDepth: 0,
        maxDepth: 5,
        referencePeriodStart: '1990-01-01',
        referencePeriodStop: '2000-12-31',
      });
      await ingestRaster({
        fileId: file.id,
        band: 2,
        datasetId: dataset.id,
        soilPropertySlug: property.slug,
        minDepth: 5,
        maxDepth: 15,
        referencePeriodStart: '2001-01-01',
        referencePeriodStop: '2020-12-31',
      });

      const entityManager = await getEntityManager();
      await updateRasterDatasetMetadata(entityManager, dataset.id, IngestionStatus.LOADED, 'tester@example.com');

      const ds = await getDataSource();
      const [row] = await ds.query(
        `SELECT status, n_raster_layers, soil_depth, spatial_resolution, reference_period_start, reference_period_stop,
                variables_measured, inferred_properties, updated_by
         FROM datasets WHERE id = $1`,
        [dataset.id],
      );

      expect(row.status).toBe(IngestionStatus.LOADED);
      expect(row.n_raster_layers).toBe(2);
      expect(row.soil_depth).toEqual({ min: 0, max: 15 });
      expect(row.spatial_resolution).toMatch(/^\d+m$/);
      expect(row.reference_period_start).toBe('1990-01-01');
      expect(row.reference_period_stop).toBe('2020-12-31');
      expect(row.variables_measured).toEqual([{ soil_property_id: property.slug, procedure_id: null }]);
      expect(row.inferred_properties).toEqual(expect.arrayContaining(['n_raster_layers', 'soil_depth', 'spatial_extent']));
      expect(row.updated_by).toBe('tester@example.com');
    });

    it('leaves licenses and n_observations alone — a raster dataset has neither to derive', async () => {
      const { dataset, property, file } = await setUpDataset('test-raster-preserves', TEST_FILE);
      const ds = await getDataSource();
      await ds.query(`UPDATE datasets SET licenses = ARRAY['cc-by'], n_observations = 42 WHERE id = $1`, [dataset.id]);

      await ingestRaster({
        fileId: file.id,
        band: 1,
        datasetId: dataset.id,
        soilPropertySlug: property.slug,
        minDepth: null,
        maxDepth: null,
      });

      const entityManager = await getEntityManager();
      await updateRasterDatasetMetadata(entityManager, dataset.id, IngestionStatus.LOADED, null);

      const [row] = await ds.query(`SELECT licenses, n_observations, gis_datatype FROM datasets WHERE id = $1`, [dataset.id]);
      expect(row.licenses).toEqual(['cc-by']);
      expect(String(row.n_observations)).toBe('42');
      expect(row.gis_datatype).toBe(GISDataType.RASTER);
    });
  });

  describe('ingestRaster - S3 storage', () => {
    beforeEach(() => {
      process.env.STORAGE_MODE = 's3';
    });

    it('creates a raster_layer record with footprints', async () => {
      const { dataset, property, file } = await setUpDataset('test-raster-s3', `raster/${TEST_FILE}`);

      const rasterLayerId = await ingestRaster({
        fileId: file.id,
        band: 1,
        datasetId: dataset.id,
        soilPropertySlug: property.slug,
        minDepth: null,
        maxDepth: null,
      });

      const ds = await getDataSource();
      const layers = await ds.query(`SELECT id, band, resolution_m FROM raster_layers`);
      expect(layers).toHaveLength(1);
      expect(layers[0].id).toBe(rasterLayerId);
      expect(layers[0].band).toBe(1);
      expect(layers[0].resolution_m).toBeGreaterThan(0);

      const [{ count }] = await ds.query(`SELECT COUNT(*) AS count FROM raster_layer_footprints WHERE raster_layer_id = $1`, [
        rasterLayerId,
      ]);
      expect(parseInt(count, 10)).toBeGreaterThan(0);
    });

    it('reads the requested band when the overview is pulled locally', async () => {
      const { dataset, property, file } = await setUpDataset('test-raster-s3-multiband', `raster/${MULTIBAND_FILE}`);

      // On the S3 path the overview is extracted with `gdal_translate -b <band>` into a
      // single-band local file, so the subsequent read index is 0 rather than band - 1.
      // Getting that fork wrong reads band 1 for every band, which this catches.
      const band2 = await ingestRaster({
        fileId: file.id,
        band: 2,
        datasetId: dataset.id,
        soilPropertySlug: property.slug,
        minDepth: null,
        maxDepth: null,
      });

      const ds = await getDataSource();
      const [{ centroid_x: centroidX }] = await ds.query(
        `SELECT ST_X(ST_Centroid(ST_Collect(rf.geom))) AS centroid_x
         FROM raster_layer_footprints rlf JOIN raster_footprints rf ON rf.id = rlf.raster_footprint_id
         WHERE rlf.raster_layer_id = $1`,
        [band2],
      );
      const [{ centroid_x: fullX }] = await ds.query(`SELECT ST_X(ST_Centroid(bbox)) AS centroid_x FROM raster_layers WHERE id = $1`, [
        band2,
      ]);
      // Band 2's valid data is the eastern half, so its footprints sit east of the file centre.
      expect(Number(centroidX)).toBeGreaterThan(Number(fullX));
    });
  });
});
