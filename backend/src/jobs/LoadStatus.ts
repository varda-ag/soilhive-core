import { IngestionStatus } from '../types/data';

/**
 * A load never targets a PUBLISHED Dataset (JobService.assertLoadable), so it runs with the Dataset
 * as it is, rather than hiding it, and ends LOADED. The exception is a Raster Load that only removes
 * the layers of removed Files: a PUBLISHED Dataset stays PUBLISHED. A failed load leaves the status
 * alone.
 */
export const statusAfterLoad = (previousStatus: IngestionStatus): IngestionStatus =>
  previousStatus === IngestionStatus.PUBLISHED ? IngestionStatus.PUBLISHED : IngestionStatus.LOADED;
