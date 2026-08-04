import { UnitConversionType } from '../types/data';

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
  property_id: string; // Soil property slug
  conversion_id: string | null; // Unit conversion slug, or null when the property declares no conversions
  min_depth: number | null;
  max_depth: number | null;
  procedure_id?: string | null; // Procedure slug
  reference_period_start?: string | null;
  reference_period_stop?: string | null;
  layer_description?: string; // Free prose about this band's Raster Layer; stored wrapped, see docs/adr/0019
  additional_resources?: RasterAdditionalResource[];
}

/**
 * One auxiliary File to attach to this band's Raster Layer — a technical manual, a prediction
 * layer, anything shipped alongside the pixels. Each entry becomes one Raster Layer Asset.
 *
 * Both keys are optional in the *shape* only: exactly what makes an entry usable is a `file_id`.
 * TODO: `url` is declared but not yet acted on — fetching the resource and storing it as a File
 * is a future flow. Until it exists, an entry carrying only a `url` is a job failure
 * (RL_ASSET_URL_UNSUPPORTED) rather than something silently dropped. When both are present the
 * `file_id` wins and the `url` is documentation of where that File came from.
 */
export interface RasterAdditionalResource {
  url?: string;
  /**
   * A File's **slug**, not its primary key — "id" means the public identifier here, as it does
   * everywhere else in the API (see CONTEXT.md, flagged ambiguities). The loader resolves it to
   * the File's uuid, through slug history, so a File renamed after the mapping was written still
   * resolves.
   */
  file_id?: string;
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
  unitType: UnitConversionType | null;
  /** Passed through verbatim: prose resolves to nothing, and the loader is what stores it. */
  layerDescription: string | null;
  /** Passed through unvalidated for the same reason band numbers are — the loader checks these. */
  additionalResources: RasterAdditionalResource[];
}
