import type GeoTIFF from 'geotiff';
import type { GeoTIFFImage } from 'geotiff';
import { fromFile, fromUrl } from 'geotiff';
import type { Polygon } from 'geojson';
import * as turf from '@turf/turf';
import FileService from '../services/FileService';
import ConfigService from '../services/ConfigService';
import { StorageModes } from '../types/enums';
import { GdalCLI, type Envelope, type GdalInfoBand, type GdalInfoOutput } from './GdalCLI';
import { log } from './logger';

export interface RasterMeta {
  nodata: number | null;
  resolution: number;
  bbox: Polygon;
  epsg?: number;
  wkt?: string;
}

const RESOLUTION_UNAVAILABLE = -1;

// Points per side of the lattice sampled across a raster whose corners don't all reproject
const ENVELOPE_SAMPLES_PER_SIDE = 21;

/**
 * Opens a GeoTIFF for reading, handling S3 (presigned URL) and local file paths.
 */
export async function openTiff(storagePath: string): Promise<GeoTIFF> {
  const config = ConfigService.getStorageConfig();
  const { mainFilePath } = await FileService.getMainFilePath(storagePath);
  return config.storageMode === StorageModes.S3 ? fromUrl(await FileService.getPresignedUrl(storagePath)) : fromFile(mainFilePath);
}

/**
 * Reads the nodata value from a geotiff.js image's file directory.
 * Returns NaN when no nodata tag is present.
 */
export function nodataFromImage(image: GeoTIFFImage): number {
  const raw: string | undefined = image.fileDirectory.getValue('GDAL_NODATA');
  return raw === undefined ? Number.NaN : parseGdalNodata(raw);
}

/** A GDAL_NODATA tag's text as a number. GDAL spells infinite markers `inf` and `-inf`, which parseFloat reads as NaN. */
export function parseGdalNodata(raw: string): number {
  // The tag's text ends in a NUL
  const text = raw.replace(/\0/g, '').trim();
  const infinite = /^([+-]?)inf(?:inity)?$/i.exec(text);
  if (infinite) return infinite[1] === '-' ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  return Number.parseFloat(text);
}

/** A nodata value as GDAL spells it: `nan`, `inf`, `-inf`, or the number. */
export function formatGdalNodata(value: number): string {
  if (Number.isNaN(value)) return 'nan';
  if (value === Number.POSITIVE_INFINITY) return 'inf';
  if (value === Number.NEGATIVE_INFINITY) return '-inf';
  return String(value);
}

function haversineDistanceMeters([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]): number {
  const earthRadiusM = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusM * Math.asin(Math.sqrt(a));
}

// A CRS's WKT is identified by its outermost keyword: PROJCRS/PROJCS for projected, GEOGCRS/GEOGCS
// for geographic. A projected CRS's WKT2 form wraps a BASEGEOGCRS definition, whose keyword contains
// "GEOGCRS" as a substring, so the projected check must run first.
export function isGeographicCrs(wkt?: string): boolean {
  if (!wkt) return true;
  if (/PROJCRS\[|PROJCS\[/.test(wkt)) return false;
  return /GEOGCRS\[|GEOGCS\[/.test(wkt);
}

// The unit a projected CRS's coordinates are in. WKT2 states it on each AXIS (or once after them
// all) following CS[...]; WKT1 states it as PROJCS's own UNIT, after PROJECTION and its PARAMETERs.
// Every unit before those — the ellipsoid's, a conversion parameter's — measures something else,
// and is in metres even for a CRS whose coordinates are in feet.
const AXIS_UNIT = /(?:\bCS\[|\bPROJECTION\[)[\s\S]*?\b(?:LENGTHUNIT|UNIT)\["([^"]*)",\s*([^,\]\s]+)/;

/**
 * Whether a projected CRS's axis unit is already meters, per its WKT (A pixel's ground
 * size is then just its native width/height for an equidistant projection).
 */
export function isMetricProjectedCrs(wkt?: string): boolean {
  const match = wkt ? AXIS_UNIT.exec(wkt) : null;
  return !!match && /^met(?:re|er)$/i.test(match[1]!) && Number(match[2]) === 1;
}

/**
 * The raster's extent in EPSG:4326, given its native extent in its own CRS's units.
 *
 * raster_layers.bbox is always stored in EPSG:4326, so a raster kept in its native CRS has its
 * extent reprojected here — the same way computeRasterFootprints reprojects footprint geometries
 * — rather than storing native-CRS coordinates mislabeled as degrees.
 *
 * A lattice of points across the raster is sampled, keeping the envelope of the ones that
 * reproject, rather than gdalinfo's wgs84Extent, which holds the four corners alone. A projected
 * raster's edges curve in EPSG:4326 (an Alaska Albers raster's top edge bulges ~4° north of its
 * top corners), and an interrupted projection (Goode Homolosine) can leave corners in the gaps
 * between its lobes or off the globe. Throws when no point reprojects: such a raster has no ground
 * to place. The envelope has west > east when the raster crosses the antimeridian.
 */
export async function wgs84Envelope(info: GdalInfoOutput, xMin: number, yMin: number, xMax: number, yMax: number): Promise<Envelope> {
  const wkt = info.coordinateSystem?.wkt;
  const epsg = GdalCLI.extractEpsgFromWkt(wkt);
  // A projected CRS always needs reprojecting, whether or not it has a registered EPSG code
  if (isGeographicCrs(wkt) && (epsg === undefined || epsg === 4326)) {
    return [Math.min(xMin, xMax), Math.min(yMin, yMax), Math.max(xMin, xMax), Math.max(yMin, yMax)];
  }

  const n = ENVELOPE_SAMPLES_PER_SIDE;
  const lattice = Array.from({ length: n * n }, (_, k): [number, number] => [
    xMin + ((xMax - xMin) * Math.floor(k / n)) / (n - 1),
    yMin + ((yMax - yMin) * (k % n)) / (n - 1),
  ]);
  const reprojected = (await GdalCLI.transformPoints(wkt!, lattice)).filter(point => point.every(Number.isFinite));
  if (reprojected.length === 0) {
    throw new Error("No point across the raster's extent reprojects to EPSG:4326");
  }
  return GdalCLI.lonLatEnvelope(reprojected);
}

/** An envelope's width in degrees of longitude, across the antimeridian when it crosses it. */
export function envelopeWidthDeg([west, , east]: Envelope): number {
  return west > east ? east + 360 - west : east - west;
}

/**
 * Reads raster metadata (nodata, pixel resolution, bbox) via gdalinfo for one band.
 *
 * `resolution` and `bbox` are properties of the file and identical for every band;
 * `nodata` is read from the requested band. `band` is 1-based, matching GDAL.
 */
export async function analyzeRasterMeta(cogPath: string, band: number): Promise<RasterMeta> {
  const { mainFilePath } = await FileService.getMainFilePath(cogPath);
  const info = await GdalCLI.gdalinfo(mainFilePath);

  const gt = info.geoTransform;
  if (!gt) throw new Error('Raster has no geoTransform');

  const [rasterNativeWidth, rasterNativeHeight] = info.size ?? [0, 0];
  const xMin = gt[0]!;
  const yMax = gt[3]!;
  const pixW = gt[1]!;
  const pixH = gt[5]!;
  const xMax = xMin + rasterNativeWidth * pixW;
  const yMin = yMax + rasterNativeHeight * pixH;

  const nodata: number | null = info.bands?.[band - 1]?.noDataValue ?? null;

  const wkt = info.coordinateSystem?.wkt;
  let resolution: number;
  if (isGeographicCrs(wkt)) {
    resolution = geographicResolutionM(pixW);
  } else {
    // Projected CRS units aren't necessarily meters (e.g. state-plane feet), so measure the ground
    // distance across one pixel — at the raster's centre, since its corners are the likeliest
    // points to fall in a gap of an interrupted projection, or off the globe.
    const centreX = (xMin + xMax) / 2;
    const centreY = (yMin + yMax) / 2;
    const [start, end] = await GdalCLI.transformPoints(wkt!, [
      [centreX, centreY],
      [centreX + pixW, centreY],
    ]);
    const measured = haversineDistanceMeters(start!, end!);
    if (Number.isFinite(measured)) {
      resolution = Math.round(measured);
    } else if (isMetricProjectedCrs(wkt)) {
      log.warn("Could not reproject the raster's centre pixel; storing its native width as resolution_m", { cogPath, band, wkt });
      resolution = Math.round(Math.abs(pixW));
    } else {
      log.warn("Could not reproject the raster's centre pixel; storing resolution_m as unavailable", { cogPath, band, wkt });
      resolution = RESOLUTION_UNAVAILABLE;
    }
  }

  // raster_layers.bbox is a single Polygon that queries test with &&, so a raster crossing the
  // antimeridian is stored as the whole band of longitude it lies in: a Polygon spanning ±180° by
  // its west and east edges would instead cover every longitude but the raster's own.
  const [west, south, east, north] = await wgs84Envelope(info, xMin, yMin, xMax, yMax);
  const bbox: Polygon = turf.bboxPolygon(west > east ? [-180, south, 180, north] : [west, south, east, north]).geometry;
  const epsg = GdalCLI.extractEpsgFromWkt(wkt);

  return {
    nodata,
    resolution,
    bbox,
    ...(epsg !== undefined && { epsg }),
    ...(wkt && { wkt }),
  };
}

// gdalinfo's raster attribute table codes
const RAT_STRING = 2;
const RAT_NAME = 2;
const RAT_MIN = 3;
const RAT_MAX = 4;
const RAT_MIN_MAX = 5;

/**
 * The class labels a band carries, as `{ pixel value: label }`: from its raster attribute table, else
 * from its category names. Undefined when it has neither, or none that name a whole-number value.
 * A value that repeats keeps its first label; several values may share one.
 */
export function categoryLabels(band: GdalInfoBand | undefined): Record<string, string> | undefined {
  const pairs = band?.rat ? ratPairs(band.rat) : (band?.categories ?? []).map((label, value): [unknown, number] => [label, value]);
  const labels: Record<string, string> = {};
  for (const [label, value] of pairs) {
    const name = typeof label === 'string' ? label.trim() : '';
    if (!name || !Number.isInteger(value) || String(value) in labels) continue;
    labels[String(value)] = name;
  }
  return Object.keys(labels).length > 0 ? labels : undefined;
}

function ratPairs(rat: NonNullable<GdalInfoBand['rat']>): Array<[unknown, number]> {
  const fields = rat.fieldDefn ?? [];
  const label = fields.find(f => f.usage === RAT_NAME) ?? fields.find(f => f.type === RAT_STRING);
  if (!label) return [];
  const value = fields.find(f => f.usage === RAT_MIN_MAX) ?? fields.find(f => /^value$/i.test(f.name) && f.type !== RAT_STRING);
  // Rows that each span a range of values cannot name one pixel value
  if (!value && fields.some(f => f.usage === RAT_MIN || f.usage === RAT_MAX)) return [];
  return (rat.row ?? []).map(row => {
    if (value) return [row.f[label.index], Number(row.f[value.index])];
    // Without a value column, a row's position is its value, offset when the rows are value bins
    return [row.f[label.index], (rat.row0Min ?? 0) + row.index * (rat.binSize ?? 1)];
  });
}

/** The overview factors of every Raster Filter: its overview tables are named o_<factor>_<table>. */
export const RASTER_FILTER_OVERVIEW_FACTORS = [2, 4, 8, 16, 32] as const;

// Assumed for a Raster Filter whose resolution is unknown: Land Cover 2019's, which the overview choice was tuned on
const DEFAULT_RASTER_FILTER_RESOLUTION_M = 100;

/** A Raster Filter's base table and its overview tables. */
export const rasterFilterTables = (table: string): string[] => [table, ...RASTER_FILTER_OVERVIEW_FACTORS.map(f => `o_${f}_${table}`)];

/** A geographic raster's resolution_m: the ground width of one pixel at the equator. */
export const geographicResolutionM = (pixelWidthDegrees: number): number => Math.round(Math.abs(pixelWidthDegrees) * 111320);

/**
 * Returns the PostGIS table name to query given an AOI area in m².
 *
 * Strategy: pick the coarsest overview whose effective pixel size
 * still keeps the AOI represented by at least ~TARGET_PIXELS pixels.
 * If the AOI is small (high detail needed), use the base table.
 *
 * @param table           - e.g. "land_cover"
 * @param aoiAreaM2       - total input AOI size in square meters
 * @param baseResolutionM - the base table's pixel size; null when unknown
 */
export const selectOverviewTable = (table: string, aoiAreaM2: number, baseResolutionM: number | null = null): string => {
  const TARGET_PIXELS = 512;
  const basePixelSizeM = baseResolutionM && baseResolutionM > 0 ? baseResolutionM : DEFAULT_RASTER_FILTER_RESOLUTION_M;

  for (const factor of [...RASTER_FILTER_OVERVIEW_FACTORS].reverse()) {
    const pixelSizeM = basePixelSizeM * factor;
    const pixelAreaM2 = pixelSizeM ** 2;
    const pixelCount = aoiAreaM2 / pixelAreaM2;
    if (pixelCount >= TARGET_PIXELS) {
      return `o_${factor}_${table}`;
    }
  }

  return table;
};
