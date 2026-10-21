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

/** The corners reprojected to EPSG:4326, or undefined unless all four reproject. */
export async function georeferenceToWgs84(georeference: Georeference, srs: string): Promise<Georeference | undefined> {
  if (srs === 'EPSG:4326') return georeference;
  try {
    const corners = await GdalCLI.transformPoints(srs, georeference);
    // gdaltransform prints "transformation failed." for a corner it can't place, which parses as NaN
    return corners.every(corner => corner.every(Number.isFinite)) ? (corners as Georeference) : undefined;
  } catch (error) {
    log.warn('Georeference does not reproject to EPSG:4326', { error: getErrorMessage(error) });
    return undefined;
  }
}
