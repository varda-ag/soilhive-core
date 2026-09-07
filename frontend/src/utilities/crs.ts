/**
 * Whether a file declares a coordinate system that names no EPSG code — a custom projection, or
 * one written without an authority. This matters only for rasters.
 */
export function hasCustomCrs(metadata: { epsg?: number | null; wkt?: string | null } | null | undefined): boolean {
  return !!metadata?.wkt && !metadata.epsg;
}
