/**
 * Whether a file declares a coordinate system that names no EPSG code — a custom projection, or
 * one written without an authority. This matters only for rasters.
 */
export function hasCustomCrs(metadata: { epsg?: number | null; wkt?: string | null } | null | undefined): boolean {
  return !!metadata?.wkt && !metadata.epsg;
}

/** The EPSG code of an "EPSG:<code>" or "EPSG:<code> - <name>" value. */
export function epsgCode(crs: string | null | undefined): number | undefined {
  const code = crs?.match(/^EPSG:(\d+)/)?.[1];
  return code === undefined ? undefined : Number(code);
}
