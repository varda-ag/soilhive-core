import type GeoTIFF from 'geotiff';
import type { GeoTIFFImage } from 'geotiff';
import type { MultiPolygon, Point, Polygon, Position } from 'geojson';
import FileService from '../services/FileService';
import { GdalCLI } from '../utils/GdalCLI';
import { isGeographicCrs, nodataFromImage, openTiff } from '../utils/raster';
import { log } from '../utils/logger';
import { getErrorMessage } from '../utils/error';

/**
 * Pixel sampling behind the raster rows of `GET /soil-data` (docs/adr/0045).
 *
 * A pixel is returned when it *touches* the AOI — any overlap of positive area counts, so an AOI
 * smaller than a pixel still yields the pixel it lies in — and its value is not nodata. The AOI is
 * reprojected into the Raster Layer's native CRS (ADR 0026) and taken into pixel space, where pixel
 * (col, row) is the unit square [col, col+1] × [row, row+1], and each pixel row is intersected with
 * the polygon analytically (see AllTouchedSweep). That is the rule `gdal_rasterize -at` applies, but
 * without one GDAL process per Raster Layer: at ~100-450 ms each (ADR 0030), a point lookup over a
 * dataset with dozens of layers would take seconds.
 */

/**
 * A raster's pixel grid in its native CRS. Pixel (col, row) spans
 * [originX + col·resX, originX + (col+1)·resX] × [originY + row·resY, originY + (row+1)·resY].
 */
export interface PixelGrid {
  width: number;
  height: number;
  originX: number;
  originY: number;
  resX: number;
  resY: number; // negative for a north-up raster
}

export interface PixelPosition {
  row: number;
  col: number;
}

export interface PixelSample extends PixelPosition {
  value: number;
}

/** An inclusive range of pixel columns. */
export type ColumnRange = [first: number, last: number];

/** The rows and columns of a grid that an AOI's bounding box covers, all inclusive. */
export interface PixelWindow {
  rowFirst: number;
  rowLast: number;
  colFirst: number;
  colLast: number;
}

/** Polygons as GeoJSON-style rings: the first ring of each is its exterior, the rest its holes. */
export type PolygonRings = Position[][];

// Bounds one window read: at most this many pixels are held in memory per Raster Layer at a time,
// whatever the size of the AOI.
const MAX_WINDOW_PIXELS = 1 << 20;
// Strips are also capped in height, so a tall, narrow AOI doesn't read far past what a page needs.
// 512 is the usual COG block height, which keeps strips aligned to whole blocks.
const MAX_STRIP_ROWS = 512;
// Pixel coordinates this close to a pixel edge are snapped onto it, so float noise from reprojection
// and from the 9-decimal GeoJSON the AOI travels as doesn't add a neighbouring pixel through a sliver
// no wider than a millionth of a pixel.
const SNAP_EPSILON = 1e-6;
// AOI edges are straight lines in EPSG:4326 (as PostGIS treats them); in a projected CRS they bend,
// so they are densified to this many degrees before reprojection.
const DENSIFY_STEP_DEG = 0.01;
// Raster Layers sampled concurrently (see readRasterPixels)
const LAYER_CONCURRENCY = 8;

const WGS84 = 'EPSG:4326';

interface Edge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  minY: number;
  maxY: number;
}

const xAt = (edge: Edge, y: number): number => edge.x1 + ((y - edge.y1) * (edge.x2 - edge.x1)) / (edge.y2 - edge.y1);

/**
 * Finds, row by row, the pixel columns whose open square intersects a set of polygons given in
 * pixel space. Rows must be visited in non-decreasing order: edges are swept by their y extent.
 *
 * For row r, the set S of x such that some (x, y) with r < y < r+1 lies in the (closed) polygon is
 * the union of
 *   - the x extent of every edge's part inside the open band r < y < r+1, and
 *   - the polygon's interior spans on the scanline y = r + 0.5 (even-odd rule).
 * A vertical line at an x outside every edge extent crosses no edge within the band, so its
 * inside/outside status is the one it has at r + 0.5. Pixel (c, r) is touched iff S meets the open
 * interval (c, c+1); for a valid polygon that is exactly "the intersection has positive area", so
 * pixels meeting the AOI only along an edge or at a corner are not touched.
 */
export class AllTouchedSweep {
  readonly bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  private readonly edges: Edge[];
  private next = 0;
  private active: Edge[] = [];
  private lastRow = -Infinity;

  constructor(polygons: PolygonRings[]) {
    const edges: Edge[] = [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const polygon of polygons) {
      for (const ring of polygon) {
        for (let i = 0; i < ring.length; i++) {
          const [x1, y1] = ring[i] as [number, number];
          const [x2, y2] = ring[(i + 1) % ring.length] as [number, number];
          minX = Math.min(minX, x1);
          maxX = Math.max(maxX, x1);
          minY = Math.min(minY, y1);
          maxY = Math.max(maxY, y1);
          // Rings may or may not repeat their first point; a closing edge of zero length is dropped.
          if (x1 === x2 && y1 === y2) continue;
          edges.push({ x1, y1, x2, y2, minY: Math.min(y1, y2), maxY: Math.max(y1, y2) });
        }
      }
    }
    edges.sort((a, b) => a.minY - b.minY);
    this.edges = edges;
    this.bounds = edges.length > 0 ? { minX, minY, maxX, maxY } : null;
  }

  /** The touched columns of `row`, clamped to [firstCol, lastCol], sorted and merged. */
  columns(row: number, firstCol: number, lastCol: number): ColumnRange[] {
    if (row < this.lastRow) {
      throw new Error(`AllTouchedSweep visits rows in order: row ${row} requested after row ${this.lastRow}`);
    }
    this.lastRow = row;
    const top = row;
    const bottom = row + 1;
    const mid = row + 0.5;

    while (this.next < this.edges.length && this.edges[this.next]!.minY < bottom) {
      this.active.push(this.edges[this.next++]!);
    }
    this.active = this.active.filter(edge => edge.maxY > top);

    const spans: [number, number][] = [];
    const crossings: number[] = [];
    for (const edge of this.active) {
      // Every active edge overlaps the open band: minY < bottom and maxY > top.
      if (edge.minY === edge.maxY) {
        spans.push([Math.min(edge.x1, edge.x2), Math.max(edge.x1, edge.x2)]);
        continue;
      }
      const xa = xAt(edge, Math.max(top, edge.minY));
      const xb = xAt(edge, Math.min(bottom, edge.maxY));
      spans.push(xa <= xb ? [xa, xb] : [xb, xa]);
      if (edge.y1 > mid !== edge.y2 > mid) {
        crossings.push(xAt(edge, mid));
      }
    }
    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      spans.push([crossings[i]!, crossings[i + 1]!]);
    }
    return toColumnRanges(spans, firstCol, lastCol);
  }
}

const toColumnRanges = (spans: [number, number][], firstCol: number, lastCol: number): ColumnRange[] => {
  const ranges: ColumnRange[] = [];
  for (const [a, b] of spans) {
    let first: number;
    let last: number;
    if (a < b) {
      // (c, c+1) meets [a, b] iff c < b and c + 1 > a
      first = Math.floor(a);
      last = Math.ceil(b) - 1;
    } else if (Number.isInteger(a)) {
      // A single x on a pixel edge (a vertical edge along a column boundary) touches no open square
      continue;
    } else {
      first = last = Math.floor(a);
    }
    first = Math.max(first, firstCol);
    last = Math.min(last, lastCol);
    if (first <= last) ranges.push([first, last]);
  }
  ranges.sort((r1, r2) => r1[0] - r2[0]);
  const merged: ColumnRange[] = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range[0] <= previous[1] + 1) {
      previous[1] = Math.max(previous[1], range[1]);
    } else {
      merged.push([range[0], range[1]]);
    }
  }
  return merged;
};

/** The rows and columns that pixel-space bounds can touch on a grid, or null when they miss it. */
export const pixelWindow = (
  bounds: NonNullable<AllTouchedSweep['bounds']>,
  grid: Pick<PixelGrid, 'width' | 'height'>,
): PixelWindow | null => {
  const window: PixelWindow = {
    rowFirst: Math.max(0, Math.floor(bounds.minY)),
    rowLast: Math.min(grid.height - 1, Math.ceil(bounds.maxY) - 1),
    colFirst: Math.max(0, Math.floor(bounds.minX)),
    colLast: Math.min(grid.width - 1, Math.ceil(bounds.maxX) - 1),
  };
  return window.rowFirst <= window.rowLast && window.colFirst <= window.colLast ? window : null;
};

const rangesAfter = (ranges: ColumnRange[], col: number): ColumnRange[] =>
  ranges.filter(([, last]) => last > col).map(([first, last]): ColumnRange => [Math.max(first, col + 1), last]);

export interface CollectTouchedPixelsOptions {
  sweep: AllTouchedSweep;
  grid: Pick<PixelGrid, 'width' | 'height'>;
  /** Reads [left, top, right, bottom) of the band, row-major. */
  readWindow: (window: [number, number, number, number]) => Promise<ArrayLike<number>>;
  isNodata: (value: number) => boolean;
  /** Exclusive: only pixels after this one, in row-then-column order, are collected. */
  after?: PixelPosition | undefined;
  max: number;
  maxWindowPixels?: number;
  /** Checked before each strip: reading stops once it aborts. */
  signal?: AbortSignal | undefined;
}

/**
 * Collects up to `max` touched, valid pixels in row-then-column order. The AOI's pixel window is
 * read in strips of whole rows, each at most `maxWindowPixels` pixels — narrowed to the columns the
 * strip actually touches — and reading stops as soon as `max` pixels are found, so the cost of a
 * page is bounded by the page, not by the AOI. A row wider than `maxWindowPixels` is read in
 * consecutive pieces, which keeps the order.
 */
export const collectTouchedPixels = async (options: CollectTouchedPixelsOptions): Promise<PixelSample[]> => {
  const { sweep, grid, readWindow, isNodata, after, max, maxWindowPixels = MAX_WINDOW_PIXELS, signal } = options;
  const found: PixelSample[] = [];
  const window = sweep.bounds ? pixelWindow(sweep.bounds, grid) : null;
  if (!window || max <= 0) return found;

  const colSpan = window.colLast - window.colFirst + 1;
  const stripRows = Math.min(MAX_STRIP_ROWS, Math.max(1, Math.floor(maxWindowPixels / colSpan)));
  let stripTop = after ? Math.max(window.rowFirst, after.row) : window.rowFirst;

  while (stripTop <= window.rowLast) {
    signal?.throwIfAborted();
    // Strips end on multiples of stripRows, so they line up with the raster's blocks when the two agree
    const stripBottom = Math.min(window.rowLast, (Math.floor(stripTop / stripRows) + 1) * stripRows - 1);
    const rows: { row: number; ranges: ColumnRange[] }[] = [];
    let minCol = Infinity;
    let maxCol = -Infinity;
    for (let row = stripTop; row <= stripBottom; row++) {
      let ranges = sweep.columns(row, window.colFirst, window.colLast);
      if (after && row === after.row) ranges = rangesAfter(ranges, after.col);
      if (ranges.length === 0) continue;
      rows.push({ row, ranges });
      minCol = Math.min(minCol, ranges[0]![0]);
      maxCol = Math.max(maxCol, ranges[ranges.length - 1]![1]);
    }
    stripTop = stripBottom + 1;
    if (rows.length === 0) continue;

    const top = rows[0]!.row;
    const height = rows[rows.length - 1]!.row - top + 1;
    // Wider than one piece only when the strip is a single row (see stripRows above)
    const pieceWidth = Math.max(1, Math.floor(maxWindowPixels / height));
    for (let left = minCol; left <= maxCol; left += pieceWidth) {
      const right = Math.min(maxCol, left + pieceWidth - 1);
      if (!rows.some(({ ranges }) => ranges.some(([first, last]) => first <= right && last >= left))) continue;
      const width = right - left + 1;
      const data = await readWindow([left, top, right + 1, top + height]);
      for (const { row, ranges } of rows) {
        for (const [first, last] of ranges) {
          for (let col = Math.max(first, left); col <= Math.min(last, right); col++) {
            const value = data[(row - top) * width + (col - left)];
            if (value === undefined || isNodata(value)) continue;
            found.push({ row, col, value });
            if (found.length >= max) return found;
          }
        }
      }
    }
  }
  return found;
};

/**
 * Whether a pixel value is nodata: NaN, infinite, or equal to one of the markers. An infinite pixel
 * is no measurement, and JSON could only carry it as null. A Float32 band holds its marker rounded to
 * single precision (-3.4e+38 is stored as -3.3999999521443642e+38), so each marker is also compared
 * in that rounding.
 */
export const nodataPredicate = (markers: Array<number | null | undefined>, float32: boolean): ((value: number) => boolean) => {
  const values = new Set<number>();
  for (const marker of markers) {
    if (marker === null || marker === undefined || Number.isNaN(marker)) continue;
    values.add(marker);
    if (float32) values.add(Math.fround(marker));
  }
  return value => !Number.isFinite(value) || values.has(value);
};

/**
 * The pixel grid of a GeoTIFF image. A north-up grid only: a rotated one is refused rather than
 * sampled wrongly. A PixelIsPoint raster's tie point is the centre of its first pixel, so the origin
 * is moved half a pixel out, as GDAL does.
 */
export const gridFromImage = (image: GeoTIFFImage): PixelGrid => {
  const width = image.getWidth();
  const height = image.getHeight();
  const tiePoint = image.fileDirectory.getValue('ModelTiepoint') as number[] | undefined;
  const pixelScale = image.fileDirectory.getValue('ModelPixelScale') as number[] | undefined;
  const transformation = image.fileDirectory.getValue('ModelTransformation') as number[] | undefined;

  let grid: PixelGrid;
  if (tiePoint && tiePoint.length >= 6 && pixelScale) {
    const [i, j, , x, y] = tiePoint as [number, number, number, number, number];
    const resX = pixelScale[0]!;
    const resY = -pixelScale[1]!;
    grid = { width, height, originX: x - i * resX, originY: y - j * resY, resX, resY };
  } else if (transformation && transformation.length >= 8) {
    if (transformation[1] !== 0 || transformation[4] !== 0) {
      throw new Error('Rotated raster grids are not supported');
    }
    grid = { width, height, originX: transformation[3]!, originY: transformation[7]!, resX: transformation[0]!, resY: transformation[5]! };
  } else {
    throw new Error('The raster has no georeferencing');
  }

  if (image.getGeoKeys()?.GTRasterTypeGeoKey === 2) {
    grid.originX -= grid.resX / 2;
    grid.originY -= grid.resY / 2;
  }
  return grid;
};

const snap = (value: number): number => {
  const nearest = Math.round(value);
  return Math.abs(value - nearest) < SNAP_EPSILON ? nearest : value;
};

/** Native-CRS polygons in the grid's pixel space. */
export const toPixelSpace = (polygons: PolygonRings[], grid: PixelGrid): PolygonRings[] =>
  polygons.map(polygon =>
    polygon.map(ring => ring.map(([x, y]) => [snap((x! - grid.originX) / grid.resX), snap((y! - grid.originY) / grid.resY)])),
  );

/** The outline of pixel (col, row) in the grid's CRS, as a closed counter-clockwise ring. */
export const pixelOutline = (grid: PixelGrid, row: number, col: number): Position[] => {
  const xa = grid.originX + col * grid.resX;
  const xb = xa + grid.resX;
  const ya = grid.originY + row * grid.resY;
  const yb = ya + grid.resY;
  const [west, east] = xa <= xb ? [xa, xb] : [xb, xa];
  const [south, north] = ya <= yb ? [ya, yb] : [yb, ya];
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
};

export const pixelCentre = (grid: PixelGrid, row: number, col: number): Position => [
  grid.originX + (col + 0.5) * grid.resX,
  grid.originY + (row + 0.5) * grid.resY,
];

export const aoiPolygons = (aoi: Polygon | MultiPolygon | null | undefined): PolygonRings[] => {
  if (aoi?.type === 'Polygon') return [aoi.coordinates];
  if (aoi?.type === 'MultiPolygon') return aoi.coordinates;
  return [];
};

/** Inserts vertices so that no edge spans more than `step` units on either axis. */
export const densify = (polygons: PolygonRings[], step: number): PolygonRings[] =>
  polygons.map(polygon =>
    polygon.map(ring => {
      const out: Position[] = [];
      for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i] as [number, number];
        out.push([x1, y1]);
        const next = ring[i + 1];
        if (!next) continue;
        const [x2, y2] = next as [number, number];
        const pieces = Math.ceil(Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) / step);
        for (let k = 1; k < pieces; k++) {
          out.push([x1 + ((x2 - x1) * k) / pieces, y1 + ((y2 - y1) * k) / pieces]);
        }
      }
      return out;
    }),
  );

const isWgs84 = (crs: string): boolean =>
  crs === WGS84 || (isGeographicCrs(crs) && crs.includes('[') && GdalCLI.extractEpsgFromWkt(crs) === 4326);

const round9 = (value: number): number => Math.round(value * 1e9) / 1e9;

/** The EPSG code a GeoTIFF's own geokeys declare, when it is a registered one. */
const epsgFromGeoKeys = (image: GeoTIFFImage): number | undefined => {
  const keys = image.getGeoKeys();
  const code = keys?.GTModelTypeGeoKey === 1 ? keys?.ProjectedCSTypeGeoKey : keys?.GeographicTypeGeoKey;
  // 32767 is GeoTIFF's "user-defined": the CRS is spelled out in other keys, not referenced
  return typeof code === 'number' && code > 0 && code < 32767 ? code : undefined;
};

/** A Raster Layer as pixel sampling needs it. */
export interface RasterPixelLayer {
  id: string;
  file_path: string;
  band: number; // 1-based
  wkt: string | null; // files.metadata.wkt — the layer's native CRS (ADR 0026)
  nodata_value: number | null;
}

export interface LocatedPixel extends PixelSample {
  layerId: string;
  /** The pixel's outline in EPSG:4326; its centre when the outline can't be reprojected; null when neither can. */
  geometry: Polygon | Point | null;
}

interface OpenedFile {
  image: GeoTIFFImage;
  grid: PixelGrid;
  crs: string;
}

/**
 * Reads up to `max` touched, valid pixels across `layers`, in the given layer order and row-then-
 * column order within each layer, starting after `after` when it names one of them. `aoi` is in
 * EPSG:4326.
 *
 * GDAL is only spawned to reproject: once per distinct projected CRS for the AOI, and once per such
 * CRS for the outlines of the pixels returned. Each File is opened once, however many of its Bands
 * are read, and every File opened is closed again before returning — after every concurrent read
 * has settled, so none is cut off by the close.
 *
 * A layer that can't be sampled (File unreadable, unsupported grid, CRS GDAL can't reach) is logged
 * and skipped, so it doesn't fail the page. An aborted `signal` does fail it.
 */
export const readRasterPixels = async (
  layers: RasterPixelLayer[],
  aoi: Polygon | MultiPolygon,
  max: number,
  after?: { layerId: string; row: number; col: number },
  signal?: AbortSignal,
): Promise<LocatedPixel[]> => {
  const wgs84Polygons = aoiPolygons(aoi);
  const tiffs: GeoTIFF[] = [];
  const files = new Map<string, Promise<OpenedFile>>();
  const nativeAoi = new Map<string, Promise<PolygonRings[]>>();

  const openFile = (filePath: string, wkt: string | null): Promise<OpenedFile> => {
    let opened = files.get(filePath);
    if (!opened) {
      opened = (async () => {
        const tiff = await openTiff(filePath);
        tiffs.push(tiff);
        const image = await tiff.getImage(0);
        return { image, grid: gridFromImage(image), crs: await resolveCrs(filePath, wkt, image) };
      })();
      files.set(filePath, opened);
    }
    return opened;
  };

  const aoiInCrs = (crs: string): Promise<PolygonRings[]> => {
    let polygons = nativeAoi.get(crs);
    if (!polygons) {
      polygons = isWgs84(crs) ? Promise.resolve(wgs84Polygons) : reprojectPolygons(densify(wgs84Polygons, DENSIFY_STEP_DEG), crs);
      nativeAoi.set(crs, polygons);
    }
    return polygons;
  };

  const sampleLayer = async (layer: RasterPixelLayer, limit: number) => {
    signal?.throwIfAborted();
    const { image, grid, crs } = await openFile(layer.file_path, layer.wkt);
    const sampleIndex = layer.band - 1;
    const float32 = image.getSampleFormat(sampleIndex) === 3 && image.getBitsPerSample(sampleIndex) === 32;
    const samples = await collectTouchedPixels({
      sweep: new AllTouchedSweep(toPixelSpace(await aoiInCrs(crs), grid)),
      grid,
      readWindow: async window => (await image.readRasters({ window, samples: [sampleIndex], signal }))[0] as ArrayLike<number>,
      // raster_layers.nodata_value is the declared marker, but it is an int column, null for
      // markers out of int range (-3.4e+38) and rounded otherwise, so the File's own marker is
      // honoured too.
      isNodata: nodataPredicate([layer.nodata_value, nodataFromImage(image)], float32),
      after: after?.layerId === layer.id ? { row: after.row, col: after.col } : undefined,
      max: limit,
      signal,
    });
    // Values are returned exactly as read, never reformatted: a Float32 pixel written as 6.2869 is
    // the JS number 6.286900043487549, which is what any other reader of the File reports too.
    return samples.map(sample => ({
      ...sample,
      layerId: layer.id,
      grid,
      crs,
    }));
  };

  try {
    const found: (PixelSample & { layerId: string; grid: PixelGrid; crs: string })[] = [];
    // A few Raster Layers are read at once, because a point lookup reads a few pixels from each of
    // many layers and would otherwise pay each File's storage round trips one after another. Each
    // reads at most what is left of the page, and results are kept in layer order, so at most
    // LAYER_CONCURRENCY - 1 layers' worth of pixels is read and discarded.
    for (let i = 0; i < layers.length && found.length < max; i += LAYER_CONCURRENCY) {
      const remaining = max - found.length;
      const batch = layers.slice(i, i + LAYER_CONCURRENCY);
      const settled = await Promise.allSettled(batch.map(layer => sampleLayer(layer, remaining)));
      // Checked first, so reads cut off by the abort aren't logged as broken layers
      signal?.throwIfAborted();
      settled.forEach((result, k) => {
        if (result.status === 'fulfilled') {
          found.push(...result.value.slice(0, max - found.length));
          return;
        }
        const layer = batch[k]!;
        log.warn('Raster Layer could not be sampled; skipping it', {
          layerId: layer.id,
          filePath: layer.file_path,
          error: getErrorMessage(result.reason),
        });
      });
    }
    signal?.throwIfAborted();
    const geometries = await pixelGeometries(found);
    return found.map(({ row, col, value, layerId }, i) => ({ row, col, value, layerId, geometry: geometries[i] ?? null }));
  } finally {
    for (const tiff of tiffs) {
      try {
        await tiff.close();
      } catch {
        // ignore close errors
      }
    }
  }
};

/**
 * The native CRS of a File: its recorded WKT (authoritative, ADR 0026); else the EPSG code its
 * geokeys declare; else what gdalinfo reports. Files without recorded metadata predate it (see the
 * flagged ambiguities in CONTEXT.md) and were warped to EPSG:4326 when ingested, so they resolve from
 * their geokeys without spawning GDAL.
 */
const resolveCrs = async (filePath: string, wkt: string | null, image: GeoTIFFImage): Promise<string> => {
  if (wkt) return wkt;
  const epsg = epsgFromGeoKeys(image);
  if (epsg !== undefined) return `EPSG:${epsg}`;
  const { mainFilePath } = await FileService.getMainFilePath(filePath);
  const info = await GdalCLI.gdalinfo(mainFilePath);
  if (info.coordinateSystem?.wkt) return info.coordinateSystem.wkt;
  log.warn('Raster has no CRS; sampling it as EPSG:4326', { filePath });
  return WGS84;
};

/**
 * Reprojects EPSG:4326 polygons into `crs` in one gdaltransform run. A vertex PROJ can't place (in a
 * gap of an interrupted projection) is dropped; a ring left with fewer than three vertices is dropped
 * with it, and a polygon whose exterior is dropped loses its holes too.
 */
const reprojectPolygons = async (polygons: PolygonRings[], crs: string): Promise<PolygonRings[]> => {
  const points = polygons.flatMap(polygon => polygon.flatMap(ring => ring.map(([x, y]): [number, number] => [x!, y!])));
  const transformed = await GdalCLI.transformPoints(WGS84, points, crs);
  let next = 0;
  let dropped = 0;
  const out: PolygonRings[] = [];
  for (const polygon of polygons) {
    const rings: Position[][] = [];
    polygon.forEach((ring, ringIndex) => {
      const kept = ring.map(() => transformed[next++]!).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
      dropped += ring.length - kept.length;
      if (kept.length >= 3 && (ringIndex === 0 || rings.length > 0)) rings.push(kept);
    });
    if (rings.length > 0) out.push(rings);
  }
  if (dropped > 0) {
    log.warn('AOI vertices could not be reprojected into the raster CRS and were dropped', { dropped });
  }
  return out;
};

/**
 * The EPSG:4326 geometry of each pixel, batched into one gdaltransform run per projected CRS. Corners
 * and centre are transformed together: when a corner falls where PROJ can't go (a gap of an
 * interrupted projection), the pixel is reported by its centre rather than by a broken outline.
 */
const pixelGeometries = async (
  pixels: { row: number; col: number; grid: PixelGrid; crs: string }[],
): Promise<(Polygon | Point | null)[]> => {
  const geometries: (Polygon | Point | null)[] = new Array(pixels.length).fill(null);
  const byCrs = new Map<string, number[]>();
  pixels.forEach(({ crs }, i) => {
    const indices = byCrs.get(crs);
    if (indices) indices.push(i);
    else byCrs.set(crs, [i]);
  });

  for (const [crs, indices] of byCrs) {
    // Five points per pixel: four corners, then the centre
    const points: Position[] = indices.flatMap(i => {
      const { grid, row, col } = pixels[i]!;
      return [...pixelOutline(grid, row, col).slice(0, 4), pixelCentre(grid, row, col)];
    });
    const transformed = isWgs84(crs)
      ? points
      : await GdalCLI.transformPoints(
          crs,
          points.map(([x, y]): [number, number] => [x!, y!]),
          WGS84,
        );
    indices.forEach((pixelIndex, k) => {
      const [sw, se, ne, nw, centre] = transformed.slice(k * 5, k * 5 + 5).map(([x, y]) => [round9(x!), round9(y!)]) as [
        Position,
        Position,
        Position,
        Position,
        Position,
      ];
      const finite = (p: Position) => Number.isFinite(p[0]) && Number.isFinite(p[1]);
      if ([sw, se, ne, nw].every(finite)) {
        geometries[pixelIndex] = { type: 'Polygon', coordinates: [[sw, se, ne, nw, sw]] };
      } else if (finite(centre)) {
        geometries[pixelIndex] = { type: 'Point', coordinates: centre };
      }
    });
  }
  return geometries;
};
