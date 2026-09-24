import type { DataRequestJobParameters } from './Job';
import type { AggregationUnit } from '../jobs/runs/types';
import type { DataRequestOutput } from '../jobs/data-requests/types';
import type { DataRequestStatus } from '../types/enums';

/**
 * What was asked, plus what resolving it produced — the `request` half of a Data Request,
 * and what a caller reads back whether the job still exists or not.
 *
 * The resolved fields are here rather than alongside the payload because they are part of the
 * question, not the answer: which areas were aggregated over is what the statistics are *of*.
 * They are also what makes the row self-sufficient — see the note on the entity.
 *
 * What is *not* here: `type` (always `data-requests`), `anonymous` (never did anything), and
 * `created_by`/`isDataAdmin`/`isSuperAdmin`, which never cross the boundary.
 */
export interface DataRequestParameters extends DataRequestJobParameters {
  /** Filter holding the Aggregation Units; null when they are `filter_id`'s own geometries. */
  derived_filter_id: string | null;
  unit_count: number;
  units: AggregationUnit[];
}

/**
 * One Data Request as `/data-requests` reports it, assembled from the job while it lives and
 * from the `data_requests` row afterwards (docs/adr/0037).
 *
 * Deliberately not the `Job` envelope: no `queue` (always `data-requests`), and none of the
 * auth fields `job.data` carries.
 */
export interface DataRequest {
  /** The Run's id: also the id of the row, and the whole of the permission to read it. */
  id: string;
  status: DataRequestStatus;
  created_at: Date;
  /** Null while the Run is still pending or running. */
  completed_at: Date | null;
  /**
   * Progress lives only on the job, so both are absent once retention has removed it — which
   * is harmless: a Data Request that outlived its job has, by definition, finished.
   */
  progress_percentage?: number;
  progress_description?: string;
  /** Display-ready failure copy. Null unless the Run failed. */
  message: string | null;
  request: DataRequestParameters;
  /** Absent until the Run completes, and forever absent if it failed. */
  data?: DataRequestOutput;
}
