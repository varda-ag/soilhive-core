import { RequestData } from '../interfaces/RequestData';
import { PG_BOSS_SCHEMA } from './PgBoss';
import { translateJobError } from '../errors/jobErrorMessages';

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

export default class ErrorService {
  async clearDatasetErrors(dataset_id: string, entityManager: RequestData['entityManager']): Promise<void> {
    await entityManager.query(
      `UPDATE ${PG_BOSS_SCHEMA}.job SET data = data - 'errors' WHERE name IN ('file-to-db', 'bulk-load') AND state = 'failed' AND data->>'dataset_id' = $1`,
      [dataset_id],
    );
  }

  async getDatasetErrors(requestData: RequestData): Promise<DatasetError[]> {
    const rows: Array<{ dataset_id: string; errors: Array<{ code: string; params: Record<string, unknown>; detail?: string }> }> =
      await requestData.entityManager.query(
        `SELECT DISTINCT ON (data->>'dataset_id')
           data->>'dataset_id' AS dataset_id,
           data->'errors' AS errors
         FROM ${PG_BOSS_SCHEMA}.job
         WHERE name IN ('file-to-db', 'bulk-load')
           AND state = 'failed'
           AND data->>'dataset_id' IS NOT NULL
           AND data->'errors' IS NOT NULL
         ORDER BY data->>'dataset_id', created_on DESC`,
      );

    return rows.map(row => ({
      dataset_id: row.dataset_id,
      errors: (row.errors ?? []).map(e => ({
        code: e.code,
        params: e.params ?? {},
        ...(e.detail !== undefined && { detail: e.detail }),
        ...translateJobError(e.code, e.params ?? {}),
      })),
    }));
  }
}
