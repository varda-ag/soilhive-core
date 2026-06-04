import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import * as path from 'path';
import * as fs from 'node:fs';
import { Polygon } from 'geojson';
import { RasterFileWriter } from '../../../src/jobs/soil-export/RasterFileWriter';
import { RasterFileFormat } from '../../../src/jobs/soil-export/types';
import { FilteredRasterLayer } from '../../../src/interfaces/DatasetFilter';
import FileService from '../../../src/services/FileService';
import { GdalCLI } from '../../../src/utils/GdalCLI';

const TEST_OUTPUT_DIR = path.join(__dirname, 'raster-test-output');
const TEST_RASTER = path.join(__dirname, '../../assets/raster/bdod_5-15cm_mean_cog.tif');

const mockAoi: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [-80.817984705196, -33.783002865481436],
      [-80.76723043805315, -33.783002865481436],
      [-80.76723043805315, -33.74798702332339],
      [-80.817984705196, -33.74798702332339],
      [-80.817984705196, -33.783002865481436],
    ],
  ],
};

function makeLayer(overrides: Partial<FilteredRasterLayer> = {}): FilteredRasterLayer {
  return {
    id: 'layer-1',
    dataset_name: 'SoilGrids 250m',
    path: 'uploads/raster/SoilGrids 250m/bdod_5-15cm_mean_cog.tif',
    min_depth: 5,
    max_depth: 15,
    reference_period_start: null,
    reference_period_stop: null,
    soil_property_name: 'Bulk density',
    ...overrides,
  };
}

function outputFiles(): string[] {
  return fs.readdirSync(TEST_OUTPUT_DIR);
}

describe('RasterFileWriter', () => {
  beforeAll(() => {
    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  });

  beforeEach(() => {
    jest.spyOn(FileService, 'getMainFilePath').mockResolvedValue({ mainFilePath: TEST_RASTER, tempZipExtractPath: null });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Note: comment out to inspect output files after a test run
    fs.readdirSync(TEST_OUTPUT_DIR).forEach(f => fs.rmSync(path.join(TEST_OUTPUT_DIR, f), { recursive: true }));
  });

  describe('writeLayer', () => {
    it('resolves layer.path via FileService.getMainFilePath', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer(), mockAoi);
      expect(FileService.getMainFilePath).toHaveBeenCalledWith(makeLayer().path);
    });

    it('produces a valid GeoTIFF with at least one raster band', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer(), mockAoi);

      const tif = outputFiles().find(f => f.endsWith('.tif'));
      if (!tif) throw new Error('No .tif output file produced');

      const info = await GdalCLI.gdalinfo(path.join(TEST_OUTPUT_DIR, tif));
      expect(info.bands?.length).toBeGreaterThan(0);
    });

    it('produces a valid GeoPackage file with one layer', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.GPKG, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer(), mockAoi);

      const gpkg = outputFiles().find(f => f.endsWith('.gpkg'));
      if (!gpkg) throw new Error('No .gpkg output file produced');

      const info = await GdalCLI.gdalinfo(path.join(TEST_OUTPUT_DIR, gpkg));
      expect(info.bands?.length).toBeGreaterThan(0);
    });

    it('clips output extent to within the AOI bounding box', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer(), mockAoi);

      const tif = outputFiles().find(f => f.endsWith('.tif'));
      if (!tif) throw new Error('No .tif output file produced');

      const info = await GdalCLI.gdalinfo(path.join(TEST_OUTPUT_DIR, tif));
      const gt =
        info.geoTransform ??
        (() => {
          throw new Error('No geoTransform on output dataset');
        })();
      const rasterSizeX = info.size
        ? info.size[0]
        : (() => {
            throw new Error('No width information on output dataset');
          })();
      const rasterSizeY = info.size
        ? info.size[1]
        : (() => {
            throw new Error('No height information on output dataset');
          })();
      const minX = gt[0];
      const maxY = gt[3];
      const maxX = minX + gt[1] * rasterSizeX;
      const minY = maxY + gt[5] * rasterSizeY;

      expect(minX).toBeGreaterThanOrEqual(-80.817984705196 - 0.01);
      expect(maxX).toBeLessThanOrEqual(-80.76723043805315 + 0.01);
      expect(minY).toBeGreaterThanOrEqual(-33.783002865481436 - 0.01);
      expect(maxY).toBeLessThanOrEqual(-33.74798702332339 + 0.01);
    });
  });

  describe('layer naming', () => {
    it('builds filename from sanitized dataset and property names', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      // sanitizeField: toLowerCase → replace '-' with '_' → strip non-[a-z0-9_]
      // 'My Dataset' → 'mydataset', 'pH' → 'ph'
      await writer.writeLayer(
        makeLayer({ dataset_name: 'My Dataset', soil_property_name: 'pH', min_depth: null, max_depth: null }),
        mockAoi,
      );
      expect(outputFiles()).toContain('mydataset_ph.tif');
    });

    it('appends depth range when both min and max depth are set', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer({ min_depth: 0, max_depth: 30 }), mockAoi);
      expect(outputFiles().some(f => f.includes('_0-30cm'))).toBe(true);
    });

    it('omits depth part when only one depth bound is set', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer({ min_depth: 0, max_depth: null }), mockAoi);
      expect(outputFiles().every(f => !/_\d+-\d+cm/.test(f))).toBe(true);
    });

    it('appends start-stop date range when both reference periods are set', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer({ reference_period_start: '2010', reference_period_stop: '2020' }), mockAoi);
      expect(outputFiles().some(f => f.includes('_2010-2020'))).toBe(true);
    });

    it('appends only start date when reference_period_stop is null', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer({ reference_period_start: '2015', reference_period_stop: null }), mockAoi);
      const files = outputFiles();
      expect(files.some(f => f.includes('_2015'))).toBe(true);
    });
  });
});
