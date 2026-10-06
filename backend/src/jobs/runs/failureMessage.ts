import { JobError } from '../../errors/JobError';
import { translateJobError, UNEXPECTED_JOB_ERROR_CODE } from '../../errors/jobErrorMessages';

/**
 * Display-ready failure copy for a Run's record, classified exactly as `runJob` classifies the
 * same error into `data.errors`, so the record and the job say the same thing for the whole time
 * both are readable.
 */
export const failureMessage = (error: unknown): string => {
  const { message, actions } = JobError.isJobError(error)
    ? translateJobError(error.code, error.params)
    : translateJobError(UNEXPECTED_JOB_ERROR_CODE);
  return [message, ...actions].join(' ');
};
