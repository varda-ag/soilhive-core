/**
 * The DAI AOI resolved in-DB (ADR 0010): instead of loading a Filter's
 * geometries into Node and clipping them to the viewport with turf, the AOI
 * CTE clips the Filter's persistent user_geometry_subdivisions pieces
 * (ADR 0006) to the viewport envelope — no geometry crosses the wire and DAI
 * reads never write ephemeral user_geometries. With no Filter geometries the
 * AOI is the bare envelope.
 *
 * The result is piece rows, not one unioned geometry: consumers must tolerate
 * a feature matching several pieces (GROUP BY / DISTINCT), and zero rows is a
 * viewport that misses the Filter's geometries entirely.
 *
 * Parameter contract (viewportAoiParams builds the matching array):
 * $1..$4 = minLon, minLat, maxLon, maxLat; $5 = uuid[] of user_geometry ids,
 * bound only when the Filter has geometries.
 */
export const viewportAoiSql = (hasGeometries: boolean): string => {
  const envelope = 'ST_MakeEnvelope($1, $2, $3, $4, 4326)';
  if (!hasGeometries) return `SELECT ${envelope} AS geom`;
  const schema = process.env.POSTGRES_SCHEMA;
  // Stored geometries are canonical (validated once at write time, see
  // insertUserGeometry) and the envelope is valid, so the intersection needs
  // no ST_MakeValid. ST_CollectionExtract(…, 3) plus the ST_IsEmpty guard drop
  // line/point contact: a geometry touching the viewport only along its edge
  // contributes no AOI.
  return `SELECT clipped.geom
      FROM (
        SELECT ST_CollectionExtract(ST_Intersection(ugs.geom, ${envelope}), 3) AS geom
        FROM ${schema}.user_geometry_subdivisions ugs
        WHERE ugs.user_geometry_id = ANY($5::uuid[])
          AND ST_Intersects(ugs.geom, ${envelope})
      ) clipped
      WHERE NOT ST_IsEmpty(clipped.geom)`;
};

export const viewportAoiParams = (bbox: [number, number, number, number], geometryIds: string[]): (number | string[])[] =>
  geometryIds.length > 0 ? [...bbox, geometryIds] : [...bbox];
