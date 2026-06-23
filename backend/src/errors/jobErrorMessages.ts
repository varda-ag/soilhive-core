export interface JobErrorMessage {
  message: string;
  action: string;
}

// To reference a param in a message or action, use {paramName}.
// The value is drawn from the `params` object passed to JobError:
//
//   throw new JobError('BL_DUPLICATE_COLUMN', { file_id: 'ex.csv', column: 'ph' });
//
//   BL_DUPLICATE_COLUMN: {
//     message: "Column '{column}' is mapped to more than one soil property.",
//     action:  "Open the mapping for file '{file_id}' and remove the duplicate.",
//   },

const JOB_ERROR_MESSAGES: Record<string, JobErrorMessage> = {
  FTD_FILE_NOT_FOUND: {
    message: 'Your file was removed from storage before processing could start.',
    action: 'Re-upload the file and start the staging job again.',
  },
  FTD_GDAL_PARSE_ERROR: {
    message: "The file format isn't recognised or the file is corrupted.",
    action: 'Verify the file is a valid CSV, GeoJSON, GeoPackage, or Shapefile (with all .dbf / .shx / .prj components), then re-upload.',
  },
  FTD_NO_DATA_COLUMNS: {
    message: 'Your file contains only geometry — no soil measurement columns were found.',
    action: 'Open the file and confirm it has at least one numeric data column besides the coordinate or geometry field.',
  },
  FTD_MISSING_LAYER_NAME: {
    message: "File metadata is incomplete and can't be processed.",
    action: 'Delete the file and re-upload it to regenerate its metadata. If this happens again, contact support.',
  },
  FTD_STALE_STAGING_TABLE: {
    message: 'A previous import attempt left behind incomplete staging data.',
    action: 'Wait a few minutes for automatic cleanup, then try again. If it persists, contact support.',
  },
  BL_RAW_TABLE_NOT_FOUND: {
    message: "One or more files haven't been staged yet and can't be loaded.",
    action:
      'Go to Files, check the status of each file in this dataset. Re-run file staging for any files showing an error, then retry data loading.',
  },
  BL_MISSING_COLUMN_MAPPING: {
    message: 'A file in this dataset has no column mapping configured.',
    action: "Go to the dataset's mapping step and configure column mappings for all files, then retry data loading.",
  },
  BL_RECORD_WRITE_FAILED: {
    message: 'An error occurred while writing soil records to the database.',
    action:
      'Try starting data loading again. If it keeps failing, check the column mapping for duplicate key conflicts or contact support.',
  },
  // FTD_GDAL_NOT_INSTALLED: reserved for future use — GdalCLI already emits a
  // 'GDAL_NOT_INSTALLED:' prefix on ENOENT so the code is detectable, but by
  // the time fileToDB runs GDAL has already been used (ogrinfo during metadata
  // extraction), making this condition practically unreachable there.
  // FTD_GDAL_NOT_INSTALLED: {
  //   message: 'File staging failed due to a server configuration problem.',
  //   action: 'Contact your system administrator — the GDAL geo-processing tools are missing from this server.',
  // },
};

const FALLBACK: JobErrorMessage = {
  message: 'An unexpected error occurred during processing.',
  action: 'Try again. If the problem persists, contact support.',
};

const interpolate = (template: string, params: Record<string, unknown>): string =>
  template.replace(/\{(\w+)\}/g, (_, key) => (params[key] !== undefined ? String(params[key]) : `{${key}}`));

export const translateJobError = (code: string, params: Record<string, unknown> = {}): JobErrorMessage => {
  const { message, action } = JOB_ERROR_MESSAGES[code] ?? FALLBACK;
  return {
    message: interpolate(message, params),
    action: interpolate(action, params),
  };
};
