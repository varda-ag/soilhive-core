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

export default class ErrorService {
  // Clearing leaves an empty `errors` array rather than dropping the key: a job without the key is
  // read as a pg-boss reap, so dropping it would bring a cleared reap back.
  async clearDatasetErrors(dataset_id: string, entityManager: RequestData['entityManager']): Promise<void> {
    await entityManager.query(
      `UPDATE ${PG_BOSS_SCHEMA}.job SET data = jsonb_set(data, '{errors}', '[]'::jsonb) WHERE name IN ('file-to-db', 'bulk-load', 'raster-load', 'bulk-delete') AND state = 'failed' AND data->>'dataset_id' = $1`,
      [dataset_id],
    );
  }

  /**
   * A failure is either a JobError recorded into `data.errors`, or a pg-boss reap (heartbeat or
   * expiry) which never runs our code and only leaves a raw message in `output` - nested under
   * `value` for the monitor's SQL. The reap is surfaced as an error with its own code.
   */
  async getDatasetErrors(requestData: RequestData): Promise<DatasetError[]> {
    const rows: Array<{ dataset_id: string; errors: StoredError[] | null; output_message: string | null }> =
      await requestData.entityManager.query(
        `SELECT DISTINCT ON (data->>'dataset_id')
           data->>'dataset_id' AS dataset_id,
           data->'errors' AS errors,
           COALESCE(output->>'message', output->'value'->>'message') AS output_message
         FROM ${PG_BOSS_SCHEMA}.job
         WHERE name IN ('file-to-db', 'bulk-load', 'raster-load', 'bulk-delete')
           AND state = 'failed'
           AND data->>'dataset_id' IS NOT NULL
           AND (
             (data->'errors' IS NOT NULL AND data->'errors' <> '[]'::jsonb)
             OR (NOT data ? 'errors' AND COALESCE(output->>'message', output->'value'->>'message') = ANY($1::text[]))
           )
         ORDER BY data->>'dataset_id', created_on DESC`,
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
