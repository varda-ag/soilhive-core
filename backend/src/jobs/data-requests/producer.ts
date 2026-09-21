import { EntityManager } from 'typeorm';
import { DataFilter } from '../../interfaces/DatasetFilter';
import { RequestData } from '../../interfaces/RequestData';

/**
 * Everything a Statistics Type producer is given, and the whole of what the Statistics
 * Types share.
 *
 * Deliberately thin: it stops at the resolved Filter. Resolving the Aggregation Units is
 * *not* shared setup even though both current producers do it, because the resolution has
 * per-type side effects — the descriptive type overwrites `raster_filtered` on every unit
 * from its own criteria, which is meaningless for a type that applies no raster mask. The
 * producers therefore call `extractUnits` themselves and reuse the module, not a pipeline.
 */
export interface ProducerContext {
  jobId: string;
  entityManager: EntityManager;
  /** Carries the entitlements re-derived inside the processor; see runDescriptiveStatistics. */
  requestData: RequestData;
  /** Resolved `filter_id`: always the criteria, and the AOI too when no `file_id` is given. */
  filter: DataFilter;
  report: (description: string, percentage: number) => Promise<void>;
  /** Throws JobCancelled when the job was cancelled; producers should call it between phases. */
  assertNotCancelled: () => Promise<void>;
}
