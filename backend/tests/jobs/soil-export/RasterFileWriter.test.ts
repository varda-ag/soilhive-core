import { describe, it, expect, beforeAll, beforeEach, afterEach, jest, afterAll } from '@jest/globals';
import * as path from 'path';
import * as fs from 'node:fs';
import { Readable } from 'stream';
import { execFileSync } from 'child_process';
import { writeArrayBuffer } from 'geotiff';
import { RasterFileWriter } from '../../../src/jobs/soil-export/RasterFileWriter';
import { RasterFileFormat } from '../../../src/jobs/soil-export/types';
import { FilteredRasterLayer } from '../../../src/interfaces/DatasetFilter';
import FileService from '../../../src/services/FileService';
import { GdalCLI } from '../../../src/utils/GdalCLI';
import { workerOutputDir, writableAsset } from '../../assets';
import { Polygon } from 'geojson';
import { fromFile } from 'geotiff';

const TEST_OUTPUT_DIR = workerOutputDir('raster-file-writer');
const TEST_RASTER = writableAsset('raster/bdod_5-15cm_mean.tif');
const EPSG3857_RASTER = writableAsset('raster/epsg3857_2b_250m.tif');
// A right triangle inside both test rasters' extents (-80.82..-80.77, -33.79..-33.74). Not a
// rectangle, so it is written tile by tile; its hypotenuse leaves part of its window untouched.
const TRIANGLE_AOI: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [-80.82, -33.79],
      [-80.77, -33.79],
      [-80.82, -33.74],
      [-80.82, -33.79],
    ],
  ],
};
// Kept outside the per-test cleanup sweep: an EPSG:4326 source holding only nodata, covering both test AOIs
const NODATA_RASTER = path.join(TEST_OUTPUT_DIR, 'test-nodata.tif');

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

function outputFiles(): string[] {
  return fs.readdirSync(TEST_OUTPUT_DIR).filter(f => f !== path.basename(NODATA_RASTER));
}

describe('RasterFileWriter', () => {
  beforeAll(() => {
    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });

    // 400×400 Float32 at 0.001°/px from (-81, -33.6): every pixel is the -9999 nodata marker
    const nodataW = 400;
    const nodataH = 400;
    const nodataBuffer = writeArrayBuffer(new Float32Array(nodataW * nodataH).fill(-9999), {
      height: nodataH,
      width: nodataW,
      SamplesPerPixel: 1,
      BitsPerSample: [32],
      SampleFormat: [3], // IEEE float
      GDAL_NODATA: '-9999',
      GTModelTypeGeoKey: 2, // ModelTypeGeographic
      GTRasterTypeGeoKey: 1, // RasterPixelIsArea
      GeographicTypeGeoKey: 4326,
      GeogCitationGeoKey: 'WGS 84',
      ModelTiepoint: [0, 0, 0, -81, -33.6, 0],
      ModelPixelScale: [0.001, 0.001, 0],
    });
    fs.writeFileSync(NODATA_RASTER, Buffer.from(nodataBuffer));
  });

  beforeEach(() => {
    jest.spyOn(FileService, 'getMainFilePath').mockResolvedValue({ mainFilePath: TEST_RASTER, tempZipExtractPath: null });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Note: comment out to inspect output files after a test run
    outputFiles().forEach(f => fs.rmSync(path.join(TEST_OUTPUT_DIR, f), { recursive: true }));
  });

  afterAll(() => {
    fs.unlinkSync(NODATA_RASTER);
  });
  describe('writeLayer', () => {
    it('resolves layer.path via FileService.getMainFilePath', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer(), TRIANGLE_AOI);
      expect(FileService.getMainFilePath).toHaveBeenCalledWith(makeLayer().path);
    });

    it('produces a valid GeoTIFF with at least one raster band', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer(), TRIANGLE_AOI);

      const tif = outputFiles().find(f => f.endsWith('.tif'));
      if (!tif) throw new Error('No .tif output file produced');

      const info = await GdalCLI.gdalinfo(path.join(TEST_OUTPUT_DIR, tif));
      expect(info.bands?.length).toBeGreaterThan(0);
    });

    it('produces a valid GeoPackage file with one layer', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.GPKG, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer(), TRIANGLE_AOI);

      const gpkg = outputFiles().find(f => f.endsWith('.gpkg'));
      if (!gpkg) throw new Error('No .gpkg output file produced');

      const info = await GdalCLI.gdalinfo(path.join(TEST_OUTPUT_DIR, gpkg));
      expect(info.bands?.length).toBeGreaterThan(0);
    });

    // gdalinfo is called without -stats, so a min/max coming back at all proves the numbers are
    // stored in the file rather than computed on read; -mm then forces a fresh scan of the same
    // pixels, which is what they have to agree with. No hardcoded values: the point is that the
    // stored Band Statistics describe the delivered crop, whatever the AOI happens to touch.
    it('embeds band statistics describing the delivered pixels', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer(), TRIANGLE_AOI);

      const tif = outputFiles().find(f => f.endsWith('.tif'));
      if (!tif) throw new Error('No .tif output file produced');
      const outPath = path.join(TEST_OUTPUT_DIR, tif);

      const stored = (await GdalCLI.gdalinfo(outPath)).bands?.[0];
      const computed = JSON.parse(execFileSync('gdalinfo', ['-json', '-mm', '--config', 'GDAL_PAM_ENABLED', 'NO', outPath]).toString())
        .bands[0];

      expect(stored?.min).toBe(computed.computedMin);
      expect(stored?.max).toBe(computed.computedMax);
    });

    it('embeds band statistics in a GeoPackage output too', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.GPKG, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer(), TRIANGLE_AOI);

      const gpkg = outputFiles().find(f => f.endsWith('.gpkg'));
      if (!gpkg) throw new Error('No .gpkg output file produced');

      const stored = (await GdalCLI.gdalinfo(path.join(TEST_OUTPUT_DIR, gpkg))).bands?.[0];
      expect(stored?.min).toBeDefined();
      expect(stored?.max).toBeDefined();
    });

    it("clips output extent to the AOI's pixel window", async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer(), TRIANGLE_AOI);

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

      // Output extent must fall within the AOI's extent (-80.82→-80.77, -33.79→-33.74) ±1 pixel tolerance
      expect(minX).toBeGreaterThanOrEqual(-80.82 - 0.01);
      expect(maxX).toBeLessThanOrEqual(-80.77 + 0.01);
      expect(minY).toBeGreaterThanOrEqual(-33.79 - 0.01);
      expect(maxY).toBeLessThanOrEqual(-33.74 + 0.01);
    });

    it('writes a non-4326 source in its own CRS, the AOI reprojected into it, without requesting a target CRS', async () => {
      jest.spyOn(FileService, 'getMainFilePath').mockResolvedValue({ mainFilePath: EPSG3857_RASTER, tempZipExtractPath: null });
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);

      const wrote = await writer.writeLayer(makeLayer({ epsg: 3857 }), TRIANGLE_AOI);

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

    it('returns false and writes nothing when the AOI misses the source', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      const elsewhere: Polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [10, 10],
            [11, 10],
            [10, 11],
            [10, 10],
          ],
        ],
      };

      const wrote = await writer.writeLayer(makeLayer(), elsewhere);

      expect(wrote).toBe(false);
      expect(outputFiles()).toHaveLength(0);
    });

    // GET /soil-data's rule (ADR 0045): a pixel counts when the AOI overlaps it at all, not only when
    // the AOI contains its centre. Pixel (col 151, row 142) of bdod spans -80.80042..-80.79814,
    // -33.77114..-33.76886 and holds 104.
    it('exports the one pixel a sliver inside it touches, though the sliver misses its centre', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      const sliver: Polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [-80.8003, -33.769],
            [-80.7999, -33.769],
            [-80.8003, -33.7694],
            [-80.8003, -33.769],
          ],
        ],
      };

      await expect(writer.writeLayer(makeLayer(), sliver)).resolves.toBe(true);

      const tif = outputFiles().find(f => f.endsWith('.tif'));
      if (!tif) throw new Error('No .tif output file produced');
      const image = await (await fromFile(path.join(TEST_OUTPUT_DIR, tif))).getImage(0);
      expect([image.getWidth(), image.getHeight()]).toEqual([1, 1]);
      expect(((await image.readRasters({ samples: [0] }))[0] as ArrayLike<number>)[0]).toBe(104);
    });

    it('never warps when no target CRS is requested', async () => {
      const warp = jest.spyOn(GdalCLI, 'warp');
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer(), TRIANGLE_AOI);

      expect(warp).not.toHaveBeenCalled();
    });

    it('warps to the requested target CRS using nearest-neighbour for a layer whose property has classes', async () => {
      const warp = jest.spyOn(GdalCLI, 'warp');
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer({ is_categorical: true, classes: { '1': { label: 'Clay' } } }), TRIANGLE_AOI, 3857);

      expect(warp).toHaveBeenCalledTimes(1);
      const args = warp.mock.calls[0]![2];
      expect(args).toContain(`EPSG:3857`);
      expect(args[args.indexOf('-r') + 1]).toBe('near');
    });

    it('warps to the requested target CRS using bilinear for a continuous layer', async () => {
      const warp = jest.spyOn(GdalCLI, 'warp');
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer({ is_categorical: false }), TRIANGLE_AOI, 3857);

      const args = warp.mock.calls[0]![2];
      expect(args[args.indexOf('-r') + 1]).toBe('bilinear');
    });

    // is_categorical records the classes as they were at ingest; the warp follows them as they are now.
    it.each([
      ['classes added since ingest', { is_categorical: false, classes: { '1': { label: 'Clay' } } }, 'near'],
      ['classes removed since ingest', { is_categorical: true, classes: null }, 'bilinear'],
    ])('resamples from the current classes, not the ingest-time flag (%s)', async (_, overrides, resampling) => {
      const warp = jest.spyOn(GdalCLI, 'warp');
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer(overrides), TRIANGLE_AOI, 3857);

      const args = warp.mock.calls[0]![2];
      expect(args[args.indexOf('-r') + 1]).toBe(resampling);
    });

    it('removes the intermediate file once the warp to a target CRS completes', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer(), TRIANGLE_AOI, 3857);

      expect(outputFiles().some(f => f.includes('.tmp.'))).toBe(false);
    });

    it('removes the intermediate file even when the warp fails', async () => {
      jest.spyOn(GdalCLI, 'warp').mockRejectedValueOnce(new Error('warp failed'));
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);

      await expect(writer.writeLayer(makeLayer(), TRIANGLE_AOI, 3857)).rejects.toThrow('warp failed');

      expect(outputFiles().some(f => f.includes('.tmp.'))).toBe(false);
    });

    // gdalwarp writes GeoTIFF only; warping straight to the output path used to leave a GeoTIFF
    // named .gpkg whenever no later merge happened to convert it.
    it('writes a real GeoPackage raster table, not a GeoTIFF, when reprojecting a GeoPackage export', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.GPKG, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer({ is_categorical: true, classes: { '1': { label: 'Clay' } } }), TRIANGLE_AOI, 3857);

      expect(outputFiles().some(f => f.includes('.tmp.'))).toBe(false);
      const gpkg = outputFiles().find(f => f.endsWith('.gpkg'));
      if (!gpkg) throw new Error('No .gpkg output file produced');
      const gpkgPath = path.join(TEST_OUTPUT_DIR, gpkg);
      const layerName = writer.buildLayerName(makeLayer(), 3857);
      const info = JSON.parse(execFileSync('gdalinfo', ['-json', `GPKG:${gpkgPath}:${layerName}`]).toString());
      expect(info.driverShortName).toBe('GPKG');
      expect(info.coordinateSystem.wkt).toContain('3857');
      expect(info.metadata[''].CLASSES).toBeDefined();
    });

    it('removes both intermediates when converting a reprojected GeoPackage fails', async () => {
      const realTranslate = GdalCLI.translate.bind(GdalCLI);
      const translate = jest.spyOn(GdalCLI, 'translate');
      const writer = new RasterFileWriter(RasterFileFormat.GPKG, TEST_OUTPUT_DIR);
      // The first translate builds the pre-warp intermediate; the second is the conversion after it.
      translate.mockImplementationOnce(realTranslate);
      translate.mockRejectedValueOnce(new Error('convert failed'));

      await expect(writer.writeLayer(makeLayer(), TRIANGLE_AOI, 3857)).rejects.toThrow('convert failed');

      expect(outputFiles().some(f => f.includes('.tmp.'))).toBe(false);
    });
  });

  describe('rectangular AOI', () => {
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
      await writer.writeLayer(makeLayer(), bboxAoi);
      expect(FileService.getMainFilePath).toHaveBeenCalledWith(makeLayer().path);
    });

    it('produces a valid GeoTIFF clipped to the bbox extent with DEFLATE/TILED creation options', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer(), bboxAoi);

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
      await writer.writeLayer(makeLayer(), bboxAoi);

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
      await writer.writeLayer(makeLayer(), bboxAoi);

      expect(warp).not.toHaveBeenCalled();
    });

    it('crops a non-4326 source to the AOI without inverting the north/south bounds', async () => {
      jest.spyOn(FileService, 'getMainFilePath').mockResolvedValue({ mainFilePath: EPSG3857_RASTER, tempZipExtractPath: null });
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);

      await writer.writeLayer(makeLayer({ epsg: 3857 }), bboxAoi);

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

      await expect(writer.writeLayer(makeLayer(), bboxAoi, 3857)).rejects.toThrow('warp failed');

      expect(outputFiles().some(f => f.includes('.tmp.'))).toBe(false);
    });

    // gdalwarp has no -stats and drops the metadata its source carried, so the stats pass has to run
    // on the warped file — computing them earlier would leave a target_crs export with none.
    it('embeds band statistics after the warp to a target CRS', async () => {
      const warp = jest.spyOn(GdalCLI, 'warp');
      const editInPlace = jest.spyOn(GdalCLI, 'editInPlace');
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer(), bboxAoi, 3857);

      expect(editInPlace).toHaveBeenCalledWith(expect.stringContaining('_3857.tif'), ['-stats']);
      expect(warp.mock.invocationCallOrder[0]!).toBeLessThan(editInPlace.mock.invocationCallOrder[0]!);

      const tif = outputFiles().find(f => f.endsWith('.tif'));
      if (!tif) throw new Error('No .tif output file produced');
      const stored = (await GdalCLI.gdalinfo(path.join(TEST_OUTPUT_DIR, tif))).bands?.[0];
      expect(stored?.min).toBeDefined();
      expect(stored?.max).toBeDefined();
    });

    // An all-nodata crop makes gdal_edit.py exit non-zero; the pixels are still complete, so the
    // export must ship the file rather than lose the job over its metadata.
    it('still ships the file when the band statistics pass fails', async () => {
      jest.spyOn(GdalCLI, 'editInPlace').mockRejectedValueOnce(new Error('no valid pixels found in sampling'));
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);

      await expect(writer.writeLayer(makeLayer(), bboxAoi)).resolves.toBe(true);

      const tif = outputFiles().find(f => f.endsWith('.tif'));
      if (!tif) throw new Error('No .tif output file produced');
      const stored = (await GdalCLI.gdalinfo(path.join(TEST_OUTPUT_DIR, tif))).bands?.[0];
      expect(stored?.min).toBeUndefined();
    });

    it.each([
      [RasterFileFormat.TIFF, undefined],
      [RasterFileFormat.GPKG, undefined],
      [RasterFileFormat.TIFF, 3857],
      [RasterFileFormat.GPKG, 3857],
    ])('returns false and writes nothing when the %s crop is all nodata (target CRS %s)', async (format, targetCrs) => {
      jest.spyOn(FileService, 'getMainFilePath').mockResolvedValue({ mainFilePath: NODATA_RASTER, tempZipExtractPath: null });
      const writer = new RasterFileWriter(format, TEST_OUTPUT_DIR);

      await expect(writer.writeLayer(makeLayer(), bboxAoi, targetCrs)).resolves.toBe(false);

      expect(outputFiles()).toHaveLength(0);
    });

    // Missing statistics are not proof of an empty file: only STATISTICS_VALID_PERCENT=0 is.
    it('still ships the file when the statistics pass fails for another reason', async () => {
      jest.spyOn(GdalCLI, 'editInPlace').mockRejectedValueOnce(new Error('gdal_edit.py not found'));
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);

      await expect(writer.writeLayer(makeLayer(), bboxAoi)).resolves.toBe(true);

      expect(outputFiles().some(f => f.endsWith('.tif'))).toBe(true);
    });

    it('still ships the file when it cannot be checked for valid pixels', async () => {
      jest.spyOn(GdalCLI, 'gdalinfo').mockRejectedValueOnce(new Error('gdalinfo failed'));
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);

      await expect(writer.writeLayer(makeLayer(), bboxAoi)).resolves.toBe(true);

      expect(outputFiles().some(f => f.endsWith('.tif'))).toBe(true);
    });

    // bdod's own GDAL_NODATA is -32768
    it('keeps the native crop when raster_layers.nodata_value is the File marker', async () => {
      const translate = jest.spyOn(GdalCLI, 'translate');
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);

      await expect(writer.writeLayer(makeLayer({ nodata_value: -32768 }), bboxAoi)).resolves.toBe(true);

      expect(translate.mock.calls.some(([, , args]) => args.includes('-srcwin'))).toBe(true);
    });

    // As GET /soil-data does (ADR 0045): a pixel holding the declared marker is nodata, even where
    // the File's own marker differs. 104 is a valid bdod value inside bboxAoi.
    it('writes pixels holding a raster_layers.nodata_value the File marker does not cover as nodata', async () => {
      const translate = jest.spyOn(GdalCLI, 'translate');
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);

      await expect(writer.writeLayer(makeLayer({ nodata_value: 104 }), bboxAoi)).resolves.toBe(true);

      expect(translate.mock.calls.some(([src]) => src.endsWith('.vrt'))).toBe(true);
      const tif = outputFiles().find(f => f.endsWith('.tif'));
      if (!tif) throw new Error('No .tif output file produced');
      const data = (await (await (await fromFile(path.join(TEST_OUTPUT_DIR, tif))).getImage(0)).readRasters({ samples: [0] }))[0] as ArrayLike<number>;
      expect(Array.from(data)).not.toContain(104);
    });
  });

  describe('CRS text', () => {
    // The tile path writes the layer's CRS into a VRT, so CRS text that is not XML-safe must be escaped
    it('writes a layer whose recorded WKT holds XML special characters', async () => {
      const wkt =
        'GEOGCS["WGS 84 & <local>",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]';
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);

      // Unescaped, buildVrt's well-formedness check throws on the & and <
      await expect(writer.writeLayer(makeLayer({ wkt }), TRIANGLE_AOI)).resolves.toBe(true);

      expect(outputFiles().some(f => f.endsWith('.tif'))).toBe(true);
    });
  });

  describe('all-nodata source', () => {
    it('writeLayer returns false and writes nothing when every touched pixel is nodata', async () => {
      jest.spyOn(FileService, 'getMainFilePath').mockResolvedValue({ mainFilePath: NODATA_RASTER, tempZipExtractPath: null });
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);

      await expect(writer.writeLayer(makeLayer(), TRIANGLE_AOI)).resolves.toBe(false);

      expect(outputFiles()).toHaveLength(0);
    });
  });

  describe('class metadata', () => {
    const classes = { '2': { label: 'Silty Clay' }, '1': { label: 'Sand & Silt', aliases: ['SaSi'] } };
    const categorical = () => makeLayer({ is_categorical: true, classes });
    const gdalinfoJson = (filePath: string) => JSON.parse(execFileSync('gdalinfo', ['-json', filePath]).toString());
    const outputPath = (ext: string) => {
      const file = outputFiles().find(f => f.endsWith(ext));
      if (!file) throw new Error(`No ${ext} output file produced`);
      return path.join(TEST_OUTPUT_DIR, file);
    };

    it('embeds the class labels in a categorical GeoTIFF and ships a raster attribute table sidecar', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(categorical(), TRIANGLE_AOI);

      const tifPath = outputPath('.tif');
      expect(fs.existsSync(`${tifPath}.aux.xml`)).toBe(true);
      const info = gdalinfoJson(tifPath);
      expect(JSON.parse(info.metadata[''].CLASSES)).toEqual({ '1': 'Sand & Silt', '2': 'Silty Clay' });
      // gdalinfo -json reports the RAT at the top level in older GDAL, under its band in newer (3.13).
      const rat = info.rat ?? info.bands[0].rat;
      expect(rat.row.map((r: { f: unknown[] }) => r.f)).toEqual([
        [1, 'Sand & Silt'],
        [2, 'Silty Clay'],
      ]);
      // Neither the second in-place edit nor the sidecar may displace the statistics in the TIFF.
      expect(info.bands[0].metadata[''].STATISTICS_MEAN).toBeDefined();
    });

    it('writes the legend for a layer ingested before its property had classes', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer({ is_categorical: false, classes }), TRIANGLE_AOI);

      const tifPath = outputPath('.tif');
      expect(fs.existsSync(`${tifPath}.aux.xml`)).toBe(true);
      expect(gdalinfoJson(tifPath).metadata[''].CLASSES).toBeDefined();
    });

    it('embeds the class labels in a GeoPackage, without a sidecar', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.GPKG, TEST_OUTPUT_DIR);
      await writer.writeLayer(categorical(), TRIANGLE_AOI);

      const gpkgPath = outputPath('.gpkg');
      expect(fs.existsSync(`${gpkgPath}.aux.xml`)).toBe(false);
      expect(JSON.parse(gdalinfoJson(gpkgPath).metadata[''].CLASSES)).toEqual({ '1': 'Sand & Silt', '2': 'Silty Clay' });
    });

    it('embeds the class labels after the warp to a target CRS, which drops metadata', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(categorical(), TRIANGLE_AOI, 3857);

      expect(gdalinfoJson(outputPath('.tif')).metadata[''].CLASSES).toBeDefined();
    });

    it('adds neither metadata nor sidecar for a layer without classes', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer(), TRIANGLE_AOI);

      expect(outputFiles().filter(f => f.endsWith('.aux.xml'))).toEqual([]);
      expect(gdalinfoJson(outputPath('.tif')).metadata[''].CLASSES).toBeUndefined();
    });
  });

  describe('layer naming', () => {
    it('builds filename from sanitized dataset and property names and layer EPSG (default 4326)', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      // sanitizeField: toLowerCase → replace '-' with '_' → strip non-[a-z0-9_]
      await writer.writeLayer(
        makeLayer({ dataset_name: 'My Dataset', soil_property_name: 'pH', min_depth: null, max_depth: null }),
        TRIANGLE_AOI,
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
        TRIANGLE_AOI,
      );
      // sanitizeField: toLowerCase → replace '-' with '_' → strip non-[a-z0-9_]
      expect(outputFiles()).toContain('mydataset_ph_h2o_ph10_3857.tif');
    });

    it('appends depth range when both min and max depth are set', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer({ min_depth: 0, max_depth: 30 }), TRIANGLE_AOI);
      expect(outputFiles().some(f => f.includes('_0-30cm'))).toBe(true);
    });

    it('omits depth part when only one depth bound is set', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer({ min_depth: 0, max_depth: null }), TRIANGLE_AOI);
      expect(outputFiles().every(f => !/_\d+-\d+cm/.test(f))).toBe(true);
    });

    it('appends start-stop date range when both reference periods are set', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer({ reference_period_start: '2010', reference_period_stop: '2020' }), TRIANGLE_AOI);
      expect(outputFiles().some(f => f.includes('_2010-2020'))).toBe(true);
    });

    it('appends only start date when reference_period_stop is null', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      await writer.writeLayer(makeLayer({ reference_period_start: '2015', reference_period_stop: null }), TRIANGLE_AOI);
      const files = outputFiles();
      expect(files.some(f => f.includes('_2015'))).toBe(true);
    });
  });

  describe('writeAsset', () => {
    it('streams content to assets/{layerName}/{filename}', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      const layerName = writer.buildLayerName(makeLayer());

      const writtenPath = await writer.writeAsset(layerName, 'manual.pdf', Readable.from(['technical manual']));

      const expectedPath = path.join(TEST_OUTPUT_DIR, 'assets', layerName, 'manual.pdf');
      expect(writtenPath).toBe(expectedPath);
      expect(fs.readFileSync(expectedPath, 'utf-8')).toBe('technical manual');
    });

    it('disambiguates two same-layer assets that share an original filename, rather than overwriting', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      const layerName = writer.buildLayerName(makeLayer());

      const firstPath = await writer.writeAsset(layerName, 'manual.pdf', Readable.from(['first']));
      const secondPath = await writer.writeAsset(layerName, 'manual.pdf', Readable.from(['second']));

      expect(firstPath).not.toBe(secondPath);
      expect(fs.readFileSync(firstPath, 'utf-8')).toBe('first');
      expect(fs.readFileSync(secondPath, 'utf-8')).toBe('second');
    });

    it('removes the partial file when the source stream fails', async () => {
      const writer = new RasterFileWriter(RasterFileFormat.TIFF, TEST_OUTPUT_DIR);
      const layerName = writer.buildLayerName(makeLayer());
      const failing = Readable.from(
        (async function* () {
          yield 'partial';
          throw new Error('connection reset');
        })(),
      );

      await expect(writer.writeAsset(layerName, 'manual.pdf', failing)).rejects.toThrow('connection reset');
      expect(fs.existsSync(path.join(TEST_OUTPUT_DIR, 'assets', layerName, 'manual.pdf'))).toBe(false);
    });
  });
});
