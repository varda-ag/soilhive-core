/**
 * A raster file's Band Mapping: what each of its bands measures.
 *
 * Stored in `data_mappings.data_mapping` like a tabular column mapping, but the two mean
 * different things — a column mapping's entries are *references* ("the column named X supplies
 * the sampling date"), while a band mapping's entries carry *literal values*, because a band has
 * no columns to point at. See docs/adr/0017 and CONTEXT.md (flagged ambiguities).
 *
 * One mapping per file; keys are 1-based band numbers. Bands the mapping does not name are not
 * ingested, which is how uncertainty, count and quality bands are excluded.
 */
export interface RasterBandMapping {
  /** Soil property slug. */
  property_id: string;
  /** Unit conversion slug, or null when the property declares no conversions. */
  conversion_id: string | null;
  min_depth: number | null;
  max_depth: number | null;
  /** Procedure slug. */
  procedure_id?: string | null;
  reference_period_start?: string | null;
  reference_period_stop?: string | null;
}

/** Stored shape of a raster file's Band Mapping, keyed by 1-based band number. */
export type RasterMappingObject = Record<string, RasterBandMapping>;

/**
 * One band's declaration with slugs resolved, ready to hand to a Raster Ingest.
 *
 * `band` is whatever the mapping key parsed to and is *not* validated here — the loader
 * checks it against the bands the file actually has, so every band failure is reported
 * from one place before any ingest writes anything.
 */
export interface ResolvedBandMapping {
  band: number;
  soilPropertySlug: string;
  procedureSlug: string | null;
  minDepth: number | null;
  maxDepth: number | null;
  referencePeriodStart: string | null;
  referencePeriodStop: string | null;
  /** Resolved from the property and conversion, used to assert the pixels need no conversion. */
  standardUnit: string | null;
  originalUnit: string | null;
  conversionFormula: string | null;
}
