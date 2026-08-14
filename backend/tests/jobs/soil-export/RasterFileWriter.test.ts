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
const EPSG3857_RASTER = path.join(__dirname, '../../assets/raster/epsg3857_2b_250m.tif');
// Kept outside the per-test cleanup sweep; covers the test AOI with all-valid pixels.
const MASK_TIFF = path.join(TEST_OUTPUT_DIR, 'test-mask.tif');
// A mask in the same EPSG:3857 metres as EPSG3857_RASTER, overlapping its extent
const MASK_TIFF_3857 = path.join(TEST_OUTPUT_DIR, 'test-mask-3857.tif');

function makeLayer(overrides: Partial<FilteredRasterLayer> = {}): FilteredRasterLayer {
  return {
    id: 'layer-1',
    dataset_name: 'SoilGrids 250m',
    path: 'uploads/raster/SoilGrids 250m/bdod_5-15cm_mean.tif',
    band: 1,
    epsg: 4326,
    min_depth: 5,
    max_depth: 15,
    reference_period_start: null,
    reference_period_stop: null,
    soil_property_name: 'Bulk density',
    standard_unit: null,
    laboratory_method: null,
    is_categorical: false,
    ...overrides,
  };
}

const MASK_BASENAMES = new Set([path.basename(MASK_TIFF), path.basename(MASK_TIFF_3857)]);

function outputFiles(): string[] {
  return fs.readdirSync(TEST_OUTPUT_DIR).filter(f => !MASK_BASENAMES.has(f));
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

    // Small all-ones Byte mask in EPSG:3857 metres, overlapping EPSG3857_RASTER's native extent
    const mask3857W = 40;
    const mask3857H = 40;
    const mask3857Buffer = writeArrayBuffer(new Uint8Array(mask3857W * mask3857H).fill(1), {
      height: mask3857H,
      width: mask3857W,
      SamplesPerPixel: 1,
      BitsPerSample: [8],
      SampleFormat: [1], // UInt
      GTModelTypeGeoKey: 1, // ModelTypeProjected
      GTRasterTypeGeoKey: 1, // RasterPixelIsArea
      ProjectedCSTypeGeoKey: 3857,
      ModelTiepoint: [0, 0, 0, -9000000, -4000000, 0],
      ModelPixelScale: [250, 250, 0],
    });
    fs.writeFileSync(MASK_TIFF_3857, Buffer.from(mask3857Buffer));
  });

  beforeEach(() => {
    jest.spyOn(FileService, 'getMainFilePath').mockResolvedValue({ mainFilePath: TEST_RASTER, tempZipExtractPath: null });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Note: comment out to inspect output files after a test run
    fs.readdirSync(TEST_OUTPUT_DIR)
      .filter(f => !MASK_BASENAMES.has(f))
      .forEach(f => fs.rmSync(path.join(TEST_OUTPUT_DIR, f), { recursive: true }));
  });

  afterAll(() => {
    fs.unlinkSync(MASK_TIFF);
    fs.unlinkSync(MASK_TIFF_3857);
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

    it('writes a non-4326 source when the mask is in the same CRS, without requesting a target CRS', async () => {
      jest.spyOn(FileService, 'getMainFilePath').mockResolvedValue({ mainFilePath: EPSG3857_RASTER, tempZipExtractPath: null });
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);

      const wrote = await writer.writeLayer(makeLayer({ epsg: 3857 }), MASK_TIFF_3857);

      expect(wrote).toBe(true);
      const tif = outputFiles().find(f => f.endsWith('.tif'));
      if (!tif) throw new Error('No .tif output file produced');

      const info = await GdalCLI.gdalinfo(path.join(TEST_OUTPUT_DIR, tif));
      expect(info.bands?.length).toBeGreaterThan(0);
      const gt = info.geoTransform!;
      // Output must land in EPSG:3857 metres (in the millions), not be mistaken for degrees.
      expect(Math.abs(gt[0]!)).toBeGreaterThan(1_000_000);
      expect(Math.abs(gt[3]!)).toBeGreaterThan(1_000_000);
    });

    it('returns false and writes nothing when the mask CRS does not match the source (mismatched extents)', async () => {
      jest.spyOn(FileService, 'getMainFilePath').mockResolvedValue({ mainFilePath: EPSG3857_RASTER, tempZipExtractPath: null });
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);

      const wrote = await writer.writeLayer(makeLayer({ epsg: 3857 }), MASK_TIFF);

      expect(wrote).toBe(false);
      expect(outputFiles()).toHaveLength(0);
    });

    it('never warps when no target CRS is requested', async () => {
      const warp = jest.spyOn(GdalCLI, 'warp');
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer(), MASK_TIFF);

      expect(warp).not.toHaveBeenCalled();
    });

    it('warps to the requested target CRS using nearest-neighbour for a categorical layer', async () => {
      const warp = jest.spyOn(GdalCLI, 'warp');
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer({ is_categorical: true }), MASK_TIFF, 3857);

      expect(warp).toHaveBeenCalledTimes(1);
      const args = warp.mock.calls[0]![2];
      expect(args).toContain(`EPSG:3857`);
      expect(args[args.indexOf('-r') + 1]).toBe('near');
    });

    it('warps to the requested target CRS using bilinear for a continuous layer', async () => {
      const warp = jest.spyOn(GdalCLI, 'warp');
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer({ is_categorical: false }), MASK_TIFF, 3857);

      const args = warp.mock.calls[0]![2];
      expect(args[args.indexOf('-r') + 1]).toBe('bilinear');
    });

    it('removes the intermediate file once the warp to a target CRS completes', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer(), MASK_TIFF, 3857);

      expect(outputFiles().some(f => f.includes('.tmp.'))).toBe(false);
    });

    it('removes the intermediate file even when the warp fails', async () => {
      jest.spyOn(GdalCLI, 'warp').mockRejectedValueOnce(new Error('warp failed'));
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);

      await expect(writer.writeLayer(makeLayer(), MASK_TIFF, 3857)).rejects.toThrow('warp failed');

      expect(outputFiles().some(f => f.includes('.tmp.'))).toBe(false);
    });
  });

  describe('cropToAoiBbox', () => {
    // Well within the bdod_5-15cm_mean.tif source extent (-81.144..-80.479, -34.003..-33.446)
    const bboxAoi = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [-80.9, -33.9],
          [-80.9, -33.7],
          [-80.7, -33.7],
          [-80.7, -33.9],
          [-80.9, -33.9],
        ],
      ],
    };

    it('resolves layer.path via FileService.getMainFilePath', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.cropToAoiBbox(makeLayer(), bboxAoi);
      expect(FileService.getMainFilePath).toHaveBeenCalledWith(makeLayer().path);
    });

    it('produces a valid GeoTIFF clipped to the bbox extent with DEFLATE/TILED creation options', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.cropToAoiBbox(makeLayer(), bboxAoi);

      const tif = outputFiles().find(f => f.endsWith('.tif'));
      if (!tif) throw new Error('No .tif output file produced');

      const info = await GdalCLI.gdalinfo(path.join(TEST_OUTPUT_DIR, tif));
      const gt =
        info.geoTransform ??
        (() => {
          throw new Error('No geoTransform on output dataset');
        })();
      const rasterSizeX = info.size![0];
      const rasterSizeY = info.size![1];
      const minX = gt[0]!;
      const maxY = gt[3]!;
      const maxX = minX + gt[1]! * rasterSizeX!;
      const minY = maxY + gt[5]! * rasterSizeY!;

      const tolerance = 0.01;
      expect(minX).toBeGreaterThanOrEqual(-80.9 - tolerance);
      expect(minX).toBeLessThanOrEqual(-80.9 + tolerance);
      expect(maxX).toBeGreaterThanOrEqual(-80.7 - tolerance);
      expect(maxX).toBeLessThanOrEqual(-80.7 + tolerance);
      expect(minY).toBeGreaterThanOrEqual(-33.9 - tolerance);
      expect(minY).toBeLessThanOrEqual(-33.9 + tolerance);
      expect(maxY).toBeGreaterThanOrEqual(-33.7 - tolerance);
      expect(maxY).toBeLessThanOrEqual(-33.7 + tolerance);

      expect(info.metadata?.IMAGE_STRUCTURE?.COMPRESSION).toBe('DEFLATE');
      expect(info.bands?.[0]?.block).toEqual([256, 256]);
    });

    it('produces a valid GeoPackage with a raster table named per buildLayerName, Float32 single band', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.GPKG, TEST_OUTPUT_DIR);
      await writer.cropToAoiBbox(makeLayer(), bboxAoi);

      const gpkg = outputFiles().find(f => f.endsWith('.gpkg'));
      if (!gpkg) throw new Error('No .gpkg output file produced');

      const layerName = path.basename(gpkg, '.gpkg');
      const info = await GdalCLI.gdalinfo(`GPKG:${path.join(TEST_OUTPUT_DIR, gpkg)}:${layerName}`);
      expect(info.bands?.length).toBe(1);
      expect(info.bands?.[0]?.type).toBe('Float32');
    });

    it('never warps when no target CRS is requested', async () => {
      const warp = jest.spyOn(GdalCLI, 'warp');
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.cropToAoiBbox(makeLayer(), bboxAoi);

      expect(warp).not.toHaveBeenCalled();
    });

    it('crops a non-4326 source to the AOI without inverting the north/south bounds', async () => {
      jest.spyOn(FileService, 'getMainFilePath').mockResolvedValue({ mainFilePath: EPSG3857_RASTER, tempZipExtractPath: null });
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);

      await writer.cropToAoiBbox(makeLayer({ epsg: 3857 }), bboxAoi);

      const tif = outputFiles().find(f => f.endsWith('.tif'));
      if (!tif) throw new Error('No .tif output file produced');

      const info = await GdalCLI.gdalinfo(path.join(TEST_OUTPUT_DIR, tif));
      const gt = info.geoTransform!;
      const [w, h] = info.size!;
      const nativeMinX = gt[0]!;
      const nativeMaxY = gt[3]!;
      const nativeMaxX = nativeMinX + gt[1]! * w!;
      const nativeMinY = nativeMaxY + gt[5]! * h!;

      // A swapped uly/lry would either make GDAL compute a negative window (and fail outright,
      // never reaching this assertion) or land the output far from the requested AOI.
      expect(nativeMinX).toBeLessThan(nativeMaxX);
      expect(nativeMinY).toBeLessThan(nativeMaxY);

      const corners = await GdalCLI.transformPoints('EPSG:3857', [
        [nativeMinX, nativeMinY],
        [nativeMaxX, nativeMaxY],
      ]);
      const [lonMin, latMin] = corners[0]!;
      const [lonMax, latMax] = corners[1]!;

      const tolerance = 0.05;
      expect(lonMin).toBeGreaterThanOrEqual(-80.9 - tolerance);
      expect(lonMax).toBeLessThanOrEqual(-80.7 + tolerance);
      expect(latMin).toBeGreaterThanOrEqual(-33.9 - tolerance);
      expect(latMax).toBeLessThanOrEqual(-33.7 + tolerance);
    });

    it('removes the intermediate file even when the warp to a target CRS fails', async () => {
      jest.spyOn(GdalCLI, 'warp').mockRejectedValueOnce(new Error('warp failed'));
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);

      await expect(writer.cropToAoiBbox(makeLayer(), bboxAoi, 3857)).rejects.toThrow('warp failed');

      expect(outputFiles().some(f => f.includes('.tmp.'))).toBe(false);
    });
  });

  describe('layer naming', () => {
    it('builds filename from sanitized dataset and property names and layer EPSG (default 4326)', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      // sanitizeField: toLowerCase → replace '-' with '_' → strip non-[a-z0-9_]
      await writer.writeLayer(
        makeLayer({ dataset_name: 'My Dataset', soil_property_name: 'pH', min_depth: null, max_depth: null }),
        MASK_TIFF,
      );
      expect(outputFiles()).toContain('mydataset_ph_4326.tif');
    });

    it('appends laboratroy method, unit info and layer EPSG if available', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(
        makeLayer({
          dataset_name: 'My Dataset',
          soil_property_name: 'pH',
          laboratory_method: 'H2O',
          standard_unit: 'pH*10',
          min_depth: null,
          max_depth: null,
          epsg: 3857,
        }),
        MASK_TIFF,
      );
      // sanitizeField: toLowerCase → replace '-' with '_' → strip non-[a-z0-9_]
      expect(outputFiles()).toContain('mydataset_ph_h2o_ph10_3857.tif');
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
