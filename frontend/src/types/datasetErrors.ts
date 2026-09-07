/**
 * The code the backend records for a failure that carried no translatable JobError — a check
 * constraint violation, a statement timeout, a dropped connection. Its `message` is the generic
 * fallback, so `detail` holds the only description of what actually went wrong.
 * Mirrors UNEXPECTED_JOB_ERROR_CODE in backend/src/errors/jobErrorMessages.ts.
 */
export const UNEXPECTED_JOB_ERROR_CODE = 'UNEXPECTED_ERROR';

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
