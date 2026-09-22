/**
 * The vocabulary shared by every kind of Run, whichever queue executes it.
 *
 * An Aggregation Unit is resolved identically for a Data Request and for a Soil Index — same
 * Filter, same optional source file, same cap — so it belongs to neither queue's module.
 */

/** An Aggregation Unit: one UserGeometry, plus how to recognise it. */
export interface AggregationUnit {
  unit_id: string;
  /** Value of `label_field` for the source row, when given. */
  label: string | null;
  /** Source rows that resolved to this unit — several when the file repeats a geometry. */
  record_ids: number[];
  /** Rounded to 3 decimals, as everywhere in this output. */
  area_m2: number | null;
  /**
   * True when raster filters applied: the unit's geometry and area are unchanged by
   * them, so the effective area the statistics cover is smaller than `area_m2`.
   */
  raster_filtered: boolean;
}
