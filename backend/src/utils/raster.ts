/**
 * Returns the PostGIS table name to query given an AOI area in m².
 *
 * Strategy: pick the coarsest overview whose effective pixel size
 * still keeps the AOI represented by at least ~TARGET_PIXELS pixels.
 * If the AOI is small (high detail needed), use the base table.
 *
 * @param table     - e.g. "land_cover"
 * @param aoiAreaM2 - total input AOI size in square meters
 */
export const selectOverviewTable = (table: string, aoiAreaM2: number): string => {
  const BASE_PIXEL_SIZE_M = 100; // meters per pixel at overview factor 1
  const TARGET_PIXELS = 512; // minimum pixels to represent the AOI (one full tile worth)
  const OVERVIEWS = [2, 4, 8, 16, 32] as const;

  // For each candidate (from coarsest to finest), check if the AOI
  // covers at least TARGET_PIXELS pixels at that overview resolution.
  // pixelSizeM = BASE_PIXEL_SIZE_M * factor
  // pixelAreaM2 = pixelSizeM * pixelSizeM
  // pixelCount = aoiAreaM2 / pixelAreaM2
  //
  // We want pixelCount >= TARGET_PIXELS (enough detail for the AOI).
  // Pick the coarsest overview that still satisfies this.

  const sorted = [...OVERVIEWS].sort((a, b) => b - a); // coarsest first: [16, 8, 4, 2]

  for (const factor of sorted) {
    const pixelSizeM = BASE_PIXEL_SIZE_M * factor;
    const pixelAreaM2 = pixelSizeM ** 2;
    const pixelCount = aoiAreaM2 / pixelAreaM2;
    if (pixelCount >= TARGET_PIXELS) {
      return `o_${factor}_${table}`;
    }
  }

  // AOI is small — use the base full-resolution table
  return table;
};
