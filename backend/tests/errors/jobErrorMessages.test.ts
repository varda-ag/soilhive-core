import { translateJobError } from '../../src/errors/jobErrorMessages';

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
    'FTD_GDAL_NOT_INSTALLED',
  ];

  test.each(DEFINED_CODES)('returns non-empty message and action for %s', code => {
    const result = translateJobError(code);
    expect(result.message).toBeTruthy();
    expect(result.action).toBeTruthy();
  });

  it('returns a generic fallback for an unknown code', () => {
    const result = translateJobError('UNKNOWN_CODE');
    expect(result.message).toBeTruthy();
    expect(result.action).toBeTruthy();
  });

  it('fallback differs from any defined message to confirm it is truly generic', () => {
    const fallback = translateJobError('UNKNOWN_CODE');
    for (const code of DEFINED_CODES) {
      const defined = translateJobError(code);
      expect(fallback.message).not.toBe(defined.message);
    }
  });
});
