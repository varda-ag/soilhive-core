import * as path from 'path';
import * as fs from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { SyntaxValidator } from 'fast-xml-validator';
import { writeArrayBuffer, GeoTIFFImage } from 'geotiff';
import { Polygon, MultiPolygon } from 'geojson';
import { RasterFileFormat } from './types';
import { FilteredRasterLayer } from '../../interfaces/DatasetFilter';
import FileService from '../../services/FileService';
import { openTiff, nodataFromImage, formatGdalNodata } from '../../utils/raster';
import { sanitizeField, sanitizeFilename } from '../../utils/utils';
import { GdalCLI } from '../../utils/GdalCLI';
import { log } from '../../utils/logger';
import { getErrorMessage } from '../../utils/error';
import { hasClasses } from '../../utils/soilPropertyClasses';
import { isAxisAlignedBboxPolygon } from '../../utils/geometry';
import {
  AllTouchedSweep,
  aoiPolygons,
  ColumnRange,
  gridFromImage,
  isWgs84,
  nodataPredicate,
  PixelGrid,
  PixelWindow,
  pixelWindow,
  polygonsInCrs,
  resolveCrs,
  toPixelSpace,
} from '../../data-layer/RasterPixels';

const TILE_SIZE = 512;

const escapeXml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * GDAL PAM sidecar holding a thematic raster attribute table for band 1: one row per class, a
 * VALUE column (usage MinMax, so it matches the pixel value) and a CLASS column (usage Name).
 * Field types: 0 = integer, 2 = string. Null when the result is not well-formed XML.
 */
export function buildClassAttributeTable(labels: Record<string, string>): string | null {
  const rows = Object.entries(labels)
    .map(([code, label], i) => `      <Row index="${i}"><F>${code}</F><F>${escapeXml(label)}</F></Row>`)
    .join('\n');
  const xml = `<PAMDataset>
  <PAMRasterBand band="1">
    <GDALRasterAttributeTable tableType="thematic">
      <FieldDefn index="0"><Name>VALUE</Name><Type>0</Type><Usage>5</Usage></FieldDefn>
      <FieldDefn index="1"><Name>CLASS</Name><Type>2</Type><Usage>2</Usage></FieldDefn>
${rows}
    </GDALRasterAttributeTable>
  </PAMRasterBand>
</PAMDataset>
`;
  try {
    SyntaxValidator.validate(xml);
  } catch {
    return null;
  }
  return xml;
}

interface TileWriteContext {
  sourceImage: GeoTIFFImage;
  sourceSampleIndex: number; // 0-based sample index: the layer's 1-based band, converted once here.
  isNodata: (value: number) => boolean;
  grid: PixelGrid;
  window: PixelWindow; // the AOI's pixel window on the source grid: the output extent
  nodataFill: number;
  nodataStr: string;
  layerName: string;
}

/** How a layer's band is read and what marks nodata in it, worked out once per layer. */
interface SourceBand {
  sampleIndex: number; // 0-based: the layer's 1-based band
  float32: boolean; // a Float32 band holds its markers rounded to single precision (nodataPredicate)
  fileNodata: number; // the File's GDAL_NODATA; NaN when it has none
}

const sourceBand = (image: GeoTIFFImage, layer: FilteredRasterLayer): SourceBand => {
  const sampleIndex = layer.band - 1;
  return {
    sampleIndex,
    float32: image.getSampleFormat(sampleIndex) === 3 && image.getBitsPerSample(sampleIndex) === 32,
    fileNodata: nodataFromImage(image),
  };
};

interface TilePlacement {
  filePath: string;
  tileX: number;
  tileY: number;
  tw: number;
  th: number;
}

export class RasterFileWriter {
  private readonly outputDir: string;
  private readonly fileFormat: RasterFileFormat;

  constructor(fileFormat: RasterFileFormat, outputDir: string) {
    this.fileFormat = fileFormat;
    this.outputDir = outputDir;
  }

  /**
   * Writes the pixels of a Raster Layer that touch the AOI (EPSG:4326): exactly the pixels
   * GET /soil-data returns for it (ADR 0045). A pixel counts when any part of it with positive area
   * lies in the AOI, decided on the layer's own grid by AllTouchedSweep after reprojecting the AOI
   * into the layer's native CRS — so a small or thin AOI still exports the pixels it lies across.
   * The output covers the AOI's pixel window at source resolution; pixels of the window the AOI
   * doesn't touch, and nodata pixels, are nodata.
   *
   * An axis-aligned rectangle over an EPSG:4326 layer touches every pixel of its window, so that case
   * is a plain crop natively in GDAL (cropToWindow), unless the layer declares a nodata value the
   * File's own marker doesn't cover. Any other AOI is written tile by tile (writeTouchedTiles).
   * Output layer naming convention is {outputDir}/{dataset_slug}_{soil_property}{_depth}{_date}_{target_crs}
   * Returns whether a file was written — `false` when the AOI touches no valid pixel.
   */
  async writeLayer(layer: FilteredRasterLayer, aoi: Polygon | MultiPolygon, targetCrs?: number): Promise<boolean> {
    const sourceTiff = await openTiff(layer.path);
    try {
      const sourceImage = await sourceTiff.getImage(0);
      const grid = gridFromImage(sourceImage);
      const crs = await resolveCrs(layer.path, layer.wkt ?? null, sourceImage);
      const sweep = new AllTouchedSweep(toPixelSpace(await polygonsInCrs(aoiPolygons(aoi), crs), grid));
      const window = sweep.bounds ? pixelWindow(sweep.bounds, grid) : null;
      if (!window) return false;

      const band = sourceBand(sourceImage, layer);

      // GDAL's crop knows only the File's GDAL_NODATA, so it is used only when that marker already
      // covers raster_layers.nodata_value; otherwise pixels holding the declared marker would ship
      // as data. The tile path honours both.
      const fileMarkerCoversDeclared =
        layer.nodata_value == null || nodataPredicate([band.fileNodata], band.float32)(layer.nodata_value);

      if (isAxisAlignedBboxPolygon(aoi) && isWgs84(crs) && fileMarkerCoversDeclared) {
        return await this.cropToWindow(layer, window, targetCrs);
      }
      return await this.writeTouchedTiles(layer, sourceImage, band, grid, sweep, window, crs, targetCrs);
    } finally {
      try {
        await sourceTiff.close();
      } catch {
        // ignore close errors
      }
    }
  }

  /**
   * Crops the source to a pixel window with gdal_translate -srcwin. Returns `false`, with the file
   * removed, when its Band Statistics show no valid pixel (all nodata).
   */
  private async cropToWindow(layer: FilteredRasterLayer, window: PixelWindow, targetCrs?: number): Promise<boolean> {
    const layerName = this.buildLayerName(layer, targetCrs);
    fs.mkdirSync(path.dirname(this.outputDir), { recursive: true });

    const { mainFilePath } = await FileService.getMainFilePath(layer.path);

    // -b selects the layer's band from the source, which may hold several. It applies to both
    // formats: without it a multiband source would export every band under a name that promises
    // a single-band layer.
    const translateArgs: string[] = [
      '-srcwin',
      String(window.colFirst),
      String(window.rowFirst),
      String(window.colLast - window.colFirst + 1),
      String(window.rowLast - window.rowFirst + 1),
      '-b',
      String(layer.band),
      '-of',
      this.getDriverName(),
      '-ot',
      'Float32',
    ];

    if (this.fileFormat === RasterFileFormat.TIFF) {
      translateArgs.push('-co', 'COMPRESS=DEFLATE', '-co', 'TILED=YES');
    } else {
      translateArgs.push('-co', `RASTER_TABLE=${layerName}`, '-co', 'TILE_FORMAT=TIFF');
    }

    const filePath = path.join(this.outputDir, `${layerName}.${this.getFileExtension()}`);
    const dstTranslate = targetCrs ? path.join(this.outputDir, `${layerName}.tmp.${this.getFileExtension()}`) : filePath;
    await GdalCLI.translate(mainFilePath, dstTranslate, translateArgs);
    if (targetCrs) {
      await this.reprojectToTargetCrs(dstTranslate, filePath, layer, layerName, targetCrs);
    }

    await this.embedBandStatistics(filePath, layer);
    if (await this.isAllNodata(filePath, layer)) {
      fs.rmSync(filePath, { force: true });
      return false;
    }
    await this.embedClassMetadata(filePath, layer);
    return true;
  }

  /**
   * Whether the Band Statistics embedBandStatistics stored say no pixel is valid. GDAL records
   * STATISTICS_VALID_PERCENT=0 even when the stats pass fails on an all-nodata band, so no second
   * scan is needed. Statistics missing altogether mean the pass failed for another reason: the file
   * is not known to be empty, and ships. Never fatal, like the statistics: a file that can't be
   * checked ships too.
   */
  private async isAllNodata(filePath: string, layer: FilteredRasterLayer): Promise<boolean> {
    try {
      const bands = (await GdalCLI.gdalinfo(filePath)).bands ?? [];
      return bands.length > 0 && bands.every(band => band.metadata?.['']?.['STATISTICS_VALID_PERCENT'] === '0');
    } catch (error) {
      log.warn('Could not check exported raster for valid pixels; file ships', {
        layerId: layer.id,
        file: path.basename(filePath),
        error: getErrorMessage(error),
      });
      return false;
    }
  }

  /**
   * Writes the touched pixels of the AOI's window in TILE_SIZE×TILE_SIZE tiles, which bounds memory
   * per tile. Each tile is written to a temp TIFF on disk; a VRT mosaics them for the final
   * gdal_translate. A tile with no touched valid pixel is never written, so a layer whose AOI touches
   * only nodata produces no file at all and returns `false`.
   */
  private async writeTouchedTiles(
    layer: FilteredRasterLayer,
    sourceImage: GeoTIFFImage,
    band: SourceBand,
    grid: PixelGrid,
    sweep: AllTouchedSweep,
    window: PixelWindow,
    sourceCrs: string,
    targetCrs?: number,
  ): Promise<boolean> {
    const outW = window.colLast - window.colFirst + 1;
    const outH = window.rowLast - window.rowFirst + 1;
    const outMinX = grid.originX + window.colFirst * grid.resX;
    const outMaxY = grid.originY + window.rowFirst * grid.resY;

    const nodataFill = Number.isNaN(band.fileNodata) ? Number.NaN : band.fileNodata;
    const nodataStr = formatGdalNodata(band.fileNodata);
    const layerName = this.buildLayerName(layer, targetCrs);

    fs.mkdirSync(this.outputDir, { recursive: true });

    const ctx: TileWriteContext = {
      sourceImage,
      sourceSampleIndex: band.sampleIndex,
      // The same markers /soil-data honours: raster_layers.nodata_value (an int column, so null or
      // rounded for a Float32 sentinel) and the File's own GDAL_NODATA.
      isNodata: nodataPredicate([layer.nodata_value, band.fileNodata], band.float32),
      grid,
      window,
      nodataFill,
      nodataStr,
      layerName,
    };

    const tiles: TilePlacement[] = [];
    try {
      for (let tileY = 0; tileY < outH; tileY += TILE_SIZE) {
        const th = Math.min(TILE_SIZE, outH - tileY);
        // The sweep visits rows in order only, so a band of tile rows is swept once and shared by
        // every tile across it.
        const rowRanges: ColumnRange[][] = [];
        for (let r = 0; r < th; r++) {
          rowRanges.push(sweep.columns(window.rowFirst + tileY + r, window.colFirst, window.colLast));
        }
        if (rowRanges.every(ranges => ranges.length === 0)) continue;

        for (let tileX = 0; tileX < outW; tileX += TILE_SIZE) {
          const tw = Math.min(TILE_SIZE, outW - tileX);
          const tilePath = await this.writeTile(ctx, rowRanges, tileX, tileY, tw, th);
          if (tilePath) tiles.push({ filePath: tilePath, tileX, tileY, tw, th });
        }
      }

      if (tiles.length === 0) return false;

      const filePath = path.join(this.outputDir, `${layerName}.${this.getFileExtension()}`);
      const vrtPath = path.join(this.outputDir, `${layerName}.tmp.vrt`);
      fs.writeFileSync(vrtPath, this.buildVrt(tiles, outW, outH, outMinX, outMaxY, grid.resX, -grid.resY, nodataStr, sourceCrs));

      try {
        const dstTranslate = targetCrs ? path.join(this.outputDir, `${layerName}.tmp.${this.getFileExtension()}`) : filePath;
        if (this.fileFormat === RasterFileFormat.TIFF) {
          await GdalCLI.translate(vrtPath, dstTranslate, [
            '-of',
            'GTiff',
            '-co',
            'COMPRESS=DEFLATE',
            '-co',
            'TILED=YES',
            '-ot',
            'Float32',
            '-a_srs',
            sourceCrs,
          ]);
        } else {
          await GdalCLI.translate(vrtPath, dstTranslate, [
            '-of',
            'GPKG',
            '-b',
            '1',
            '-co',
            `RASTER_TABLE=${layerName}`,
            '-co',
            'TILE_FORMAT=TIFF',
            '-ot',
            'Float32',
            '-a_srs',
            sourceCrs,
          ]);
        }
        if (targetCrs) {
          await this.reprojectToTargetCrs(dstTranslate, filePath, layer, layerName, targetCrs);
        }
      } finally {
        fs.unlinkSync(vrtPath);
      }

      await this.embedBandStatistics(filePath, layer);
      await this.embedClassMetadata(filePath, layer);
    } finally {
      for (const tile of tiles) {
        try {
          fs.unlinkSync(tile.filePath);
        } catch {
          // ignore cleanup errors
        }
      }
    }
    return true;
  }

  /**
   * Writes one tile of the output window: the touched pixels of `rowRanges` (absolute source
   * columns, one entry per tile row) that are valid, nodata everywhere else. Returns null, writing
   * nothing, when the tile holds no touched valid pixel.
   */
  private async writeTile(
    ctx: TileWriteContext,
    rowRanges: ColumnRange[][],
    tileX: number,
    tileY: number,
    tw: number,
    th: number,
  ): Promise<string | null> {
    const { sourceImage, sourceSampleIndex, isNodata, grid, window, nodataFill, nodataStr, layerName } = ctx;
    const left = window.colFirst + tileX;
    const right = left + tw - 1;
    const top = window.rowFirst + tileY;
    if (!rowRanges.some(ranges => ranges.some(([first, last]) => first <= right && last >= left))) return null;

    const srcRasters = await sourceImage.readRasters({
      window: [left, top, left + tw, top + th],
      samples: [sourceSampleIndex],
    });
    const srcData = srcRasters[0] as ArrayLike<number>;

    const tileData = new Float32Array(tw * th).fill(nodataFill);
    let hasValid = false;
    rowRanges.forEach((ranges, r) => {
      for (const [first, last] of ranges) {
        for (let col = Math.max(first, left); col <= Math.min(last, right); col++) {
          const i = r * tw + (col - left);
          const value = srcData[i] as number;
          if (isNodata(value)) continue;
          tileData[i] = value;
          hasValid = true;
        }
      }
    });
    if (!hasValid) return null;

    const tileGeoXMin = grid.originX + left * grid.resX;
    const tileGeoYMax = grid.originY + top * grid.resY;

    const ab = writeArrayBuffer(tileData, {
      height: th,
      width: tw,
      SamplesPerPixel: 1,
      BitsPerSample: [32],
      SampleFormat: [3], // IEEE float
      GDAL_NODATA: nodataStr,
      GTModelTypeGeoKey: 2, // ModelTypeGeographic
      GTRasterTypeGeoKey: 1, // RasterPixelIsArea
      GeographicTypeGeoKey: 4326,
      GeogCitationGeoKey: 'WGS 84',
      ModelTiepoint: [0, 0, 0, tileGeoXMin, tileGeoYMax, 0],
      ModelPixelScale: [grid.resX, -grid.resY, 0],
    });

    const tilePath = path.join(this.outputDir, `${layerName}.tile_${tileY}_${tileX}.tmp.tif`);
    fs.writeFileSync(tilePath, Buffer.from(ab));
    return tilePath;
  }

  private buildVrt(
    tiles: TilePlacement[],
    outW: number,
    outH: number,
    xMin: number,
    yMax: number,
    pixW: number,
    pixH: number,
    nodataStr: string,
    srs: string,
  ): string {
    const sources = tiles
      .map(
        t => `    <SimpleSource>
      <SourceFilename relativeToVRT="0">${t.filePath}</SourceFilename>
      <SourceBand>1</SourceBand>
      <SourceProperties RasterXSize="${t.tw}" RasterYSize="${t.th}" DataType="Float32" BlockXSize="${t.tw}" BlockYSize="1"/>
      <SrcRect xOff="0" yOff="0" xSize="${t.tw}" ySize="${t.th}"/>
      <DstRect xOff="${t.tileX}" yOff="${t.tileY}" xSize="${t.tw}" ySize="${t.th}"/>
    </SimpleSource>`,
      )
      .join('\n');
    const xml = `<VRTDataset rasterXSize="${outW}" rasterYSize="${outH}">
  <SRS dataAxisToSRSAxisMapping="2,1">${escapeXml(srs)}</SRS>
  <GeoTransform>${xMin}, ${pixW}, 0.0, ${yMax}, 0.0, ${-pixH}</GeoTransform>
  <VRTRasterBand dataType="Float32" band="1">
    <NoDataValue>${nodataStr}</NoDataValue>
${sources}
  </VRTRasterBand>
</VRTDataset>`;

    try {
      SyntaxValidator.validate(xml);
    } catch (error) {
      throw new Error(`buildVrt: generated VRT is not well-formed XML: ${error instanceof Error ? error.message : String(error)}`);
    }
    return xml;
  }

  /**
   * Streams a Raster Layer Asset into this layer's assets subfolder
   * ({outputDir}/assets/{layerName}/{sanitized original filename}), creating the subfolder as
   * needed. When two assets on the same layer sanitize to the same filename, later ones are
   * disambiguated with a numeric suffix rather than overwriting the first. A failed stream
   * leaves no partial file behind.
   */
  async writeAsset(layerName: string, originalFilename: string, content: Readable): Promise<string> {
    const assetsDir = path.join(this.outputDir, 'assets', layerName);
    fs.mkdirSync(assetsDir, { recursive: true });

    const safeName = sanitizeFilename(originalFilename);
    const ext = path.extname(safeName);
    const stem = safeName.slice(0, safeName.length - ext.length);

    let candidate = safeName;
    for (let suffix = 1; fs.existsSync(path.join(assetsDir, candidate)); suffix++) {
      candidate = `${stem}_${suffix}${ext}`;
    }

    const filePath = path.join(assetsDir, candidate);
    try {
      await pipeline(content, fs.createWriteStream(filePath));
    } catch (error) {
      fs.rmSync(filePath, { force: true });
      throw error;
    }
    return filePath;
  }

  buildLayerName(layer: FilteredRasterLayer, targetCrs?: number): string {
    const depthPart = layer.min_depth !== null && layer.max_depth !== null ? `_${layer.min_depth}-${layer.max_depth}cm` : '';
    let datePart = '';
    if (layer.reference_period_start !== null && layer.reference_period_stop !== null) {
      datePart = `_${layer.reference_period_start}-${layer.reference_period_stop}`;
    } else if (layer.reference_period_start !== null) {
      datePart = `_${layer.reference_period_start}`;
    }
    const lmPart = layer.laboratory_method !== null ? `_${sanitizeField(layer.laboratory_method)}` : '';
    const suPart = layer.standard_unit !== null ? `_${sanitizeField(layer.standard_unit)}` : '';
    const crsPart = targetCrs ?? layer.epsg ?? (layer.wkt ? 'custom' : 4326);
    return `${sanitizeField(layer.dataset_name)}_${sanitizeField(layer.soil_property_name)}${lmPart}${suPart}${depthPart}${datePart}_${crsPart}`;
  }

  /**
   * Writes the finished file's **Band Statistics** — minimum, maximum, mean, standard deviation and
   * the share of valid pixels — into the file itself, as the `STATISTICS_*` band metadata every GDAL
   * reader (and QGIS, and ArcGIS) already knows how to read. They describe the pixels actually
   * delivered: the AOI crop, after the mask, after any reprojection — never the whole source Band,
   * whose range is a catalog fact rather than a property of this file.
   *
   * A separate in-place pass, not `-stats` on the `gdal_translate` that produced the file, even
   * though that flag would compute the same numbers during a pass GDAL is already making. Three
   * reasons, all invisible at the translate call site:
   *   - `-stats` caches its result in a PAM sidecar *next to the source*. In `cropToWindow` that
   *     source is the ingested COG in file storage, which an export must never write to; in
   *     `writeLayer` it is the temp VRT in the job's directory, so the sidecar outlives the VRT and
   *     `zipFiles` sweeps a stray `*.tmp.vrt.aux.xml` into the user's download.
   *   - `gdalwarp` has no `-stats` and drops the metadata its source carried, so every `target_crs`
   *     export would end up with no Band Statistics at all.
   *   - One post-step covers all four path endings (crop or mask, warped or not) instead of three
   *     partially-overlapping ones.
   * The cost is one extra read pass over an AOI-sized crop. Suppressing it means reintroducing the
   * three problems above.
   *
   * Never fatal: a file whose pixels are complete still ships. The expected trigger is a window crop
   * containing no valid pixels — `gdal_edit.py -stats` exits non-zero on an all-nodata band, and
   * cropToWindow then drops the file (isAllNodata); writeTouchedTiles never writes one.
   */
  private async embedBandStatistics(filePath: string, layer: FilteredRasterLayer): Promise<void> {
    try {
      await GdalCLI.editInPlace(filePath, ['-stats']);
    } catch (error) {
      log.warn('Could not embed band statistics in exported raster; it ships without them unless it holds no valid pixel', {
        layerId: layer.id,
        file: path.basename(filePath),
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * Records what a layer's pixel values mean, from the soil property's classes, in two places:
   *   - A `CLASSES` metadata item, JSON {"1": "Clay", ...}, inside the file itself: the
   *     GDAL_METADATA tag for GeoTIFF, gpkg metadata for GeoPackage. PAM is disabled for this edit
   *     so that GDAL stores it there or fails, rather than falling back to a sidecar.
   *   - GeoTIFF only: a raster attribute table in a `.tif.aux.xml` sidecar,
   *     which is how GIS tools (QGIS, ArcGIS) name the classes in a layer's legend. GeoTIFF can't
   *     hold a RAT itself, and the GeoPackage driver drops one entirely, so GeoPackage gets the
   *     metadata item only. Written by hand rather than through GDAL, which has no CLI to set a
   *     RAT short of rewriting the pixels through a VRT; it lands in the bundle because the export
   *     zips the whole output directory.
   * Never fatal, like the statistics: the pixels are complete without it.
   */
  private async embedClassMetadata(filePath: string, layer: FilteredRasterLayer): Promise<void> {
    const classes = layer.classes;
    if (!hasClasses(classes)) return;
    const codes = Object.keys(classes).sort((a, b) => Number(a) - Number(b));
    const labels = Object.fromEntries(codes.map(code => [code, classes[code]!.label]));

    try {
      await GdalCLI.editInPlace(filePath, ['--config', 'GDAL_PAM_ENABLED', 'NO', '-mo', `CLASSES=${JSON.stringify(labels)}`]);

      if (this.fileFormat === RasterFileFormat.TIFF) {
        const auxPath = `${filePath}.aux.xml`;
        if (fs.existsSync(auxPath)) {
          // Not expected (nothing above writes PAM); never overwrite what GDAL wrote.
          log.warn('Exported raster already has a .aux.xml sidecar; class attribute table not written', {
            layerId: layer.id,
            file: path.basename(filePath),
          });
          return;
        }
        const attributeTable = buildClassAttributeTable(labels);
        if (attributeTable === null) {
          log.warn('Class attribute table is not well-formed XML; exported raster ships without it', {
            layerId: layer.id,
            file: path.basename(filePath),
          });
          return;
        }
        fs.writeFileSync(auxPath, attributeTable);
      }
    } catch (error) {
      log.warn('Could not embed class metadata in exported raster; file ships without it', {
        layerId: layer.id,
        file: path.basename(filePath),
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * Reprojects `src` (an intermediate, always removed) to the target CRS at `filePath`, in this
   * writer's format. gdalwarp can only write GeoTIFF here, so a GeoPackage export warps into a
   * second intermediate GeoTIFF and converts that, with the same table options as every other
   * GeoPackage this writer produces — warping straight to `filePath` would leave a GeoTIFF behind a
   * `.gpkg` name, which only went unnoticed when mergeGPKG happened to convert it afterwards.
   */
  private async reprojectToTargetCrs(
    src: string,
    filePath: string,
    layer: FilteredRasterLayer,
    layerName: string,
    targetCrs: number,
  ): Promise<void> {
    const warpArgs = this.warpToTargetCrsArgs(targetCrs, hasClasses(layer.classes));
    const warped = this.fileFormat === RasterFileFormat.GPKG ? path.join(this.outputDir, `${layerName}.tmp.warp.tif`) : filePath;
    try {
      await GdalCLI.warp(src, warped, warpArgs);
      if (warped !== filePath) {
        await GdalCLI.translate(warped, filePath, [
          '-of',
          'GPKG',
          '-co',
          `RASTER_TABLE=${layerName}`,
          '-co',
          'TILE_FORMAT=TIFF',
          '-ot',
          'Float32',
        ]);
      }
    } finally {
      for (const intermediate of warped === filePath ? [src] : [src, warped]) {
        try {
          fs.unlinkSync(intermediate);
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }

  /**
   * Nearest-neighbour for a categorical layer (never invent a class value between two others);
   * bilinear otherwise — mirrors RasterIngestService.convertRaster's ingest-time resampling choice.
   * Decided from the property's classes as they are now, not from `is_categorical`, which records
   * them as they were at ingest: a property given classes since is still reprojected without
   * interpolation, since the warp reads full-resolution pixels, not the ingest-time overviews.
   */
  private warpToTargetCrsArgs(targetCrs: number, isCategorical: boolean): string[] {
    return [
      '--config',
      'GDAL_CACHEMAX',
      '512',
      '--config',
      'GDAL_NUM_THREADS',
      'ALL_CPUS',
      '-t_srs',
      `EPSG:${targetCrs}`,
      '-r',
      isCategorical ? 'near' : 'bilinear',
      '-of',
      'GTiff',
      '-co',
      'TILED=YES',
      '-co',
      'COMPRESS=DEFLATE',
      '-co',
      'BIGTIFF=YES',
    ];
  }

  private getDriverName(): string {
    switch (this.fileFormat) {
      case RasterFileFormat.TIFF:
        return 'GTiff';
      case RasterFileFormat.GPKG:
        return 'GPKG';
      default:
        throw new Error(`Unsupported raster format: ${this.fileFormat}`);
    }
  }

  private getFileExtension(): string {
    switch (this.fileFormat) {
      case RasterFileFormat.TIFF:
        return 'tif';
      case RasterFileFormat.GPKG:
        return 'gpkg';
      default:
        throw new Error(`Unsupported raster format: ${this.fileFormat}`);
    }
  }
}
