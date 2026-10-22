import type { Georeference } from '../interfaces/File';
import { getErrorMessage } from './error';
import { GdalCLI, type GdalInfoOutput, type OgrInfoLayer } from './GdalCLI';
import { log } from './logger';

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
