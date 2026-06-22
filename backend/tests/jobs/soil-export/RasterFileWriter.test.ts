import { describe, it, expect, beforeAll, beforeEach, afterEach, jest, afterAll } from '@jest/globals';
import * as path from 'path';
import * as fs from 'node:fs';
import { writeArrayBuffer } from 'geotiff';
import { RasterFileWriter } from '../../../src/jobs/soil-export/RasterFileWriter';
import { RasterFileFormat } from '../../../src/jobs/soil-export/types';
import { FilteredRasterLayer } from '../../../src/interfaces/DatasetFilter';
import FileService from '../../../src/services/FileService';
import { GdalCLI } from '../../../src/utils/GdalCLI';

const TEST_OUTPUT_DIR = path.join(__dirname, 'raster-test-output');
const TEST_RASTER = path.join(__dirname, '../../assets/raster/bdod_5-15cm_mean.tif');
// Kept outside the per-test cleanup sweep; covers the test AOI with all-valid pixels.
const MASK_TIFF = path.join(TEST_OUTPUT_DIR, 'test-mask.tif');

function makeLayer(overrides: Partial<FilteredRasterLayer> = {}): FilteredRasterLayer {
  return {
    id: 'layer-1',
    dataset_name: 'SoilGrids 250m',
    path: 'uploads/raster/SoilGrids 250m/bdod_5-15cm_mean.tif',
    min_depth: 5,
    max_depth: 15,
    reference_period_start: null,
    reference_period_stop: null,
    soil_property_name: 'Bulk density',
    ...overrides,
  };
}

function outputFiles(): string[] {
  return fs.readdirSync(TEST_OUTPUT_DIR).filter(f => f !== path.basename(MASK_TIFF));
}

describe('RasterFileWriter', () => {
  beforeAll(() => {
    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });

    // Small all-ones Byte mask covering the test AOI region.
    // Extent: xMin=-80.82, yMax=-33.74, 50×50 px at 0.001°/px
    // → xMax=-80.77, yMin=-33.79 — fits inside bdod source extent.
    const maskW = 50;
    const maskH = 50;
    const maskBuffer = writeArrayBuffer(new Uint8Array(maskW * maskH).fill(1), {
      height: maskH,
      width: maskW,
      SamplesPerPixel: 1,
      BitsPerSample: [8],
      SampleFormat: [1], // UInt
      GTModelTypeGeoKey: 2, // ModelTypeGeographic
      GTRasterTypeGeoKey: 1, // RasterPixelIsArea
      GeographicTypeGeoKey: 4326,
      GeogCitationGeoKey: 'WGS 84',
      ModelTiepoint: [0, 0, 0, -80.82, -33.74, 0],
      ModelPixelScale: [0.001, 0.001, 0],
    });
    fs.writeFileSync(MASK_TIFF, Buffer.from(maskBuffer));
  });

  beforeEach(() => {
    jest.spyOn(FileService, 'getMainFilePath').mockResolvedValue({ mainFilePath: TEST_RASTER, tempZipExtractPath: null });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Note: comment out to inspect output files after a test run
    fs.readdirSync(TEST_OUTPUT_DIR)
      .filter(f => f !== path.basename(MASK_TIFF))
      .forEach(f => fs.rmSync(path.join(TEST_OUTPUT_DIR, f), { recursive: true }));
  });

  afterAll(() => {
    fs.unlinkSync(MASK_TIFF);
  });
  describe('writeLayer', () => {
    it('resolves layer.path via FileService.getMainFilePath', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer(), MASK_TIFF);
      expect(FileService.getMainFilePath).toHaveBeenCalledWith(makeLayer().path);
    });

    it('produces a valid GeoTIFF with at least one raster band', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer(), MASK_TIFF);

      const tif = outputFiles().find(f => f.endsWith('.tif'));
      if (!tif) throw new Error('No .tif output file produced');

      const info = await GdalCLI.gdalinfo(path.join(TEST_OUTPUT_DIR, tif));
      expect(info.bands?.length).toBeGreaterThan(0);
    });

    it('produces a valid GeoPackage file with one layer', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.GPKG, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer(), MASK_TIFF);

      const gpkg = outputFiles().find(f => f.endsWith('.gpkg'));
      if (!gpkg) throw new Error('No .gpkg output file produced');

      const info = await GdalCLI.gdalinfo(path.join(TEST_OUTPUT_DIR, gpkg));
      expect(info.bands?.length).toBeGreaterThan(0);
    });

    it('clips output extent to within the mask bounding box', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer(), MASK_TIFF);

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

      // Output extent must fall within the mask extent (-80.82→-80.77, -33.79→-33.74) ±1 pixel tolerance
      expect(minX).toBeGreaterThanOrEqual(-80.82 - 0.01);
      expect(maxX).toBeLessThanOrEqual(-80.77 + 0.01);
      expect(minY).toBeGreaterThanOrEqual(-33.79 - 0.01);
      expect(maxY).toBeLessThanOrEqual(-33.74 + 0.01);
    });
  });

  describe('layer naming', () => {
    it('builds filename from sanitized dataset and property names', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      // sanitizeField: toLowerCase → replace '-' with '_' → strip non-[a-z0-9_]
      // 'My Dataset' → 'mydataset', 'pH' → 'ph'
      await writer.writeLayer(
        makeLayer({ dataset_name: 'My Dataset', soil_property_name: 'pH', min_depth: null, max_depth: null }),
        MASK_TIFF,
      );
      expect(outputFiles()).toContain('mydataset_ph.tif');
    });

    it('appends depth range when both min and max depth are set', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer({ min_depth: 0, max_depth: 30 }), MASK_TIFF);
      expect(outputFiles().some(f => f.includes('_0-30cm'))).toBe(true);
    });

    it('omits depth part when only one depth bound is set', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer({ min_depth: 0, max_depth: null }), MASK_TIFF);
      expect(outputFiles().every(f => !/_\d+-\d+cm/.test(f))).toBe(true);
    });

    it('appends start-stop date range when both reference periods are set', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer({ reference_period_start: '2010', reference_period_stop: '2020' }), MASK_TIFF);
      expect(outputFiles().some(f => f.includes('_2010-2020'))).toBe(true);
    });

    it('appends only start date when reference_period_stop is null', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer({ reference_period_start: '2015', reference_period_stop: null }), MASK_TIFF);
      const files = outputFiles();
      expect(files.some(f => f.includes('_2015'))).toBe(true);
    });
  });
});
