import type { Georeference } from '../interfaces/File';
import { getErrorMessage } from './error';
import { GdalCLI, type Envelope, type GdalInfoOutput, type OgrInfoLayer } from './GdalCLI';
import { log } from './logger';

// Points per side of the lattice sampled across a raster whose corners don't all reproject
const ENVELOPE_SAMPLES_PER_SIDE = 21;

/** A raster's corners, or null without a geoTransform: gdalinfo then reports pixel coordinates. */
export function rasterGeoreference(info: GdalInfoOutput): Georeference | null {
  const { upperLeft, upperRight, lowerRight, lowerLeft } = info.cornerCoordinates ?? {};
  if (!info.geoTransform || !upperLeft || !upperRight || !lowerRight || !lowerLeft) return null;
  return [upperLeft, upperRight, lowerRight, lowerLeft];
}

/** The corners of a vector layer's extent. */
export function vectorGeoreference(layer: OgrInfoLayer): Georeference | null {
  if (!layer.extent) return null;
  const [minX, minY, maxX, maxY] = layer.extent;
  return [
    [minX, maxY],
    [maxX, maxY],
    [maxX, minY],
    [minX, minY],
  ];
}

/**
 * The corners with each one's longitude taken within 180° of the one before it, so that the
 * outline through them crosses the antimeridian rather than going round the globe the other way.
 * A file crossing it then has longitudes past ±180°.
 */
export function unwrapLongitudes(corners: Georeference): Georeference {
  let previous = corners[0][0];
  return corners.map(([lon, lat]) => {
    const unwrapped = lon + 360 * Math.round((previous - lon) / 360);
    previous = unwrapped;
    return [unwrapped, lat];
  }) as Georeference;
}

/** The corners reprojected to EPSG:4326, or undefined unless all four reproject. */
export async function georeferenceToWgs84(georeference: Georeference, srs: string): Promise<Georeference | undefined> {
  if (srs === 'EPSG:4326') return georeference;
  try {
    const corners = await GdalCLI.transformPoints(srs, georeference);
    // gdaltransform prints "transformation failed." for a corner it can't place, which parses as NaN
    return corners.every(corner => corner.every(Number.isFinite)) ? unwrapLongitudes(corners as Georeference) : undefined;
  } catch (error) {
    log.warn('Georeference does not reproject to EPSG:4326', { error: getErrorMessage(error) });
    return undefined;
  }
}

// A CRS's WKT is identified by its outermost keyword: PROJCRS/PROJCS for projected, GEOGCRS/GEOGCS
// for geographic. A projected CRS's WKT2 form wraps a BASEGEOGCRS definition, whose keyword contains
// "GEOGCRS" as a substring, so the projected check must run first.
export function isGeographicCrs(wkt?: string): boolean {
  if (!wkt) return true;
  if (/PROJCRS\[|PROJCS\[/.test(wkt)) return false;
  return /GEOGCRS\[|GEOGCS\[/.test(wkt);
}

/**
 * The raster's extent in EPSG:4326, given its native extent in `srs`: its WKT, or `EPSG:<code>`.
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
export async function wgs84Envelope(srs: string | undefined, xMin: number, yMin: number, xMax: number, yMax: number): Promise<Envelope> {
  const epsg = GdalCLI.extractEpsgFromWkt(srs);
  // A projected CRS always needs reprojecting, whether or not it has a registered EPSG code
  if (srs === 'EPSG:4326' || (isGeographicCrs(srs) && (epsg === undefined || epsg === 4326))) {
    return [Math.min(xMin, xMax), Math.min(yMin, yMax), Math.max(xMin, xMax), Math.max(yMin, yMax)];
  }

  const n = ENVELOPE_SAMPLES_PER_SIDE;
  const lattice = Array.from({ length: n * n }, (_, k): [number, number] => [
    xMin + ((xMax - xMin) * Math.floor(k / n)) / (n - 1),
    yMin + ((yMax - yMin) * (k % n)) / (n - 1),
  ]);
  const reprojected = (await GdalCLI.transformPoints(srs!, lattice)).filter(point => point.every(Number.isFinite));
  if (reprojected.length === 0) {
    throw new Error("No point across the raster's extent reprojects to EPSG:4326");
  }
  return GdalCLI.lonLatEnvelope(reprojected);
}

/** A raster File's Bounding box, from its corners in `srs`, or undefined when no point of it reprojects. */
export async function georeferenceBboxWgs84(georeference: Georeference, srs: string): Promise<Envelope | undefined> {
  const xs = georeference.map(([x]) => x);
  const ys = georeference.map(([, y]) => y);
  try {
    return await wgs84Envelope(srs, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
  } catch (error) {
    log.warn('Raster extent does not reproject to EPSG:4326', { error: getErrorMessage(error) });
    return undefined;
  }
}
