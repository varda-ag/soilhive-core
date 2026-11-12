import { RequestData } from '../interfaces/RequestData';
import { PG_BOSS_SCHEMA } from './PgBoss';
import { queueReapCode, QUEUE_REAP_MESSAGES, translateJobError } from '../errors/jobErrorMessages';

export interface DatasetErrorItem {
  code: string;
  message: string;
  actions: string[];
  params: Record<string, unknown>;
  detail?: string;
}

export interface DatasetError {
  dataset_id: string;
  errors: DatasetErrorItem[];
}

type StoredError = { code: string; params?: Record<string, unknown>; detail?: string };

// The queues whose failures are a Dataset's errors
const DATASET_ERROR_QUEUES = `('file-to-db', 'bulk-load', 'raster-load', 'bulk-delete', 'version-reset', 'version-discard', 'version-publish')`;

// The Dataset a failed job's errors belong to, by slug. A version-publish locks the Dataset it
// publishes into by dataset_id, but its errors are the Version's, where it's published from.
const ERROR_DATASET = `CASE WHEN name = 'version-publish' THEN data->>'version_id' ELSE data->>'dataset_id' END`;

// SQL twin of outputMessage. A shutdown's `value` is a string; ->> on an object `value` gives JSON text, which matches no reap.
const OUTPUT_MESSAGE = `COALESCE(output->>'message', output->'value'->>'message', output->>'value')`;

export default class ErrorService {
  // Clearing leaves an empty `errors` array rather than dropping the key: a job without the key is
  // read as a pg-boss reap, so dropping it would bring a cleared reap back.
  async clearDatasetErrors(dataset_id: string, entityManager: RequestData['entityManager']): Promise<void> {
    await entityManager.query(
      `UPDATE ${PG_BOSS_SCHEMA}.job SET data = jsonb_set(data, '{errors}', '[]'::jsonb) WHERE name IN ${DATASET_ERROR_QUEUES} AND state = 'failed' AND ${ERROR_DATASET} = $1`,
      [dataset_id],
    );
  }

  /**
   * A failure is either a JobError recorded into `data.errors`, or a pg-boss reap (heartbeat,
   * expiry or shutdown) which never runs our code and only leaves a raw message in `output` -
   * nested under `value` for the monitor's SQL, or a plain string `value` for a shutdown. The
   * reap is surfaced as an error with its own code.
   */
  async getDatasetErrors(requestData: RequestData): Promise<DatasetError[]> {
    const rows: Array<{ dataset_id: string; errors: StoredError[] | null; output_message: string | null }> =
      await requestData.entityManager.query(
        `SELECT DISTINCT ON (${ERROR_DATASET})
           ${ERROR_DATASET} AS dataset_id,
           data->'errors' AS errors,
           ${OUTPUT_MESSAGE} AS output_message
         FROM ${PG_BOSS_SCHEMA}.job
         WHERE name IN ${DATASET_ERROR_QUEUES}
           AND state = 'failed'
           AND ${ERROR_DATASET} IS NOT NULL
           AND (
             (data->'errors' IS NOT NULL AND data->'errors' <> '[]'::jsonb)
             OR (NOT data ? 'errors' AND ${OUTPUT_MESSAGE} = ANY($1::text[]))
           )
         ORDER BY ${ERROR_DATASET}, created_on DESC`,
        [QUEUE_REAP_MESSAGES],
      );

    return rows.map(row => {
      const reapCode = row.errors ? undefined : queueReapCode(row.output_message ?? '');
      const stored: StoredError[] = row.errors ?? (reapCode ? [{ code: reapCode }] : []);
      return {
        dataset_id: row.dataset_id,
        errors: stored.map(e => ({
          code: e.code,
          params: e.params ?? {},
          ...(e.detail !== undefined && { detail: e.detail }),
          ...translateJobError(e.code, e.params ?? {}),
        })),
      };
    });
  }
}
