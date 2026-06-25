import { JobError } from '../../src/errors/JobError';
import { translateJobError } from '../../src/errors/jobErrorMessages';

describe('JobError', () => {
  it('stores detail when provided', () => {
    const err = new JobError('BL_RECORD_WRITE_FAILED', {}, 'duplicate key value');
    expect(err.detail).toBe('duplicate key value');
  });

  it('detail is undefined when omitted', () => {
    const err = new JobError('BL_RECORD_WRITE_FAILED');
    expect(err.detail).toBeUndefined();
  });
});

describe('translateJobError', () => {
  const DEFINED_CODES = [
    'FTD_FILE_NOT_FOUND',
    'FTD_GDAL_PARSE_ERROR',
    'FTD_NO_DATA_COLUMNS',
    'FTD_MISSING_LAYER_NAME',
    'FTD_STALE_STAGING_TABLE',
    'BL_RAW_TABLE_NOT_FOUND',
    'BL_MISSING_COLUMN_MAPPING',
    'BL_RECORD_WRITE_FAILED',
    'BL_RECORD_VALIDATION_FAILED',
  ];

  test.each(DEFINED_CODES)('returns non-empty message and actions for %s', code => {
    const result = translateJobError(code);
    expect(result.message).toBeTruthy();
    expect(result.actions.length).toBeGreaterThan(0);
    result.actions.forEach(a => expect(a).toBeTruthy());
  });

  it('returns a generic fallback for an unknown code', () => {
    const result = translateJobError('UNKNOWN_CODE');
    expect(result.message).toBeTruthy();
    expect(result.actions.length).toBeGreaterThan(0);
  });

  it('interpolates field and issue params in BL_RECORD_VALIDATION_FAILED', () => {
    const result = translateJobError('BL_RECORD_VALIDATION_FAILED', { field: 'geometry', issue: 'must be object' });
    expect(result.message).toBe("A record was rejected because field 'geometry' must be object.");
    expect(result.actions[0]).toContain("'geometry'");
  });

  it('fallback differs from any defined message to confirm it is truly generic', () => {
    const fallback = translateJobError('UNKNOWN_CODE');
    for (const code of DEFINED_CODES) {
      const defined = translateJobError(code);
      expect(fallback.message).not.toBe(defined.message);
    }
  });
});
