export interface JobErrorMessage {
  message: string;
  actions: string[];
}

// To reference a param in a message or action, use {paramName}.
// The value is drawn from the `params` object passed to JobError:
//
//   throw new JobError('BL_DUPLICATE_COLUMN', { file_id: 'ex.csv', column: 'ph' });
//
//   BL_DUPLICATE_COLUMN: {
//     message: "Column '{column}' is mapped to more than one soil property.",
//     actions: ["Open the mapping for file '{file_id}' and remove the duplicate."],
//   },

const JOB_ERROR_MESSAGES: Record<string, JobErrorMessage> = {
  FTD_FILE_NOT_FOUND: {
    message: 'Your file was removed from storage before processing could start.',
    actions: ['Re-upload the file and start the staging job again.'],
  },
  FTD_GDAL_PARSE_ERROR: {
    message: "The file format isn't recognised or the file is corrupted.",
    actions: [
      'Verify the file is a valid CSV, GeoJSON, GeoPackage, or Shapefile (with all .dbf / .shx / .prj components), then re-upload.',
    ],
  },
  FTD_NO_DATA_COLUMNS: {
    message: 'Your file contains only geometry — no soil measurement columns were found.',
    actions: ['Open the file and confirm it has at least one numeric data column besides the coordinate or geometry field.'],
  },
  FTD_MISSING_LAYER_NAME: {
    message: "File metadata is incomplete and can't be processed.",
    actions: ['Delete the file and re-upload it to regenerate its metadata. If this happens again, contact support.'],
  },
  FTD_RASTER_NOT_SUPPORTED: {
    message: "This file is a raster and can't be loaded through file staging yet.",
    actions: ['Raster ingestion is not yet available through this pipeline.'],
  },
  FTD_INVALID_DEPTH_RANGE: {
    message: 'Column mapped to depth did not contain a valid range.',
    actions: [
      'Review your mapping to ensure you have mapped the depth related columns to depth if range, or min depth and max depth if separate values.',
      'Check your file is compliant with the guidelines in the documentation: https://github.com/varda-ag/soilhive-core/blob/main/docs/data-model/1-data-management-portal.md#soil-data--upload-your-files.',
    ],
  },
  FTD_STALE_STAGING_TABLE: {
    message: 'A previous import attempt left behind incomplete staging data.',
    actions: ['Wait a few minutes for automatic cleanup, then try again. If it persists, contact support.'],
  },
  BL_RAW_TABLE_NOT_FOUND: {
    message: "One or more files haven't been staged yet and can't be loaded.",
    actions: [
      'Go to Files, check the status of each file in this dataset. Re-run file staging for any files showing an error, then retry data loading.',
    ],
  },
  BL_MISSING_COLUMN_MAPPING: {
    message: 'A file in this dataset has no column mapping configured.',
    actions: ["Go to the dataset's mapping step and configure column mappings for all files, then retry data loading."],
  },
  BL_RECORD_WRITE_FAILED: {
    message: 'An error occurred while writing soil records to the database.',
    actions: [
      'Try starting data loading again.',
      'If it keeps failing, double check your data against the guidelines in the documentation at: https://github.com/varda-ag/soilhive-core/blob/main/docs/data-model/1-data-management-portal.md#soil-data--upload-your-files',
    ],
  },
  RL_MISSING_BAND_MAPPING: {
    message: 'A raster file in this dataset has no band mapping configured.',
    actions: ["Go to the dataset's mapping step and declare what each band of every raster file measures, then retry data loading."],
  },
  RL_INVALID_BAND: {
    message: "The band mapping for '{file_name}' refers to band {band}, which the file does not have (it has {band_count}).",
    actions: [
      "Open the mapping for '{file_name}' and map only bands 1 to {band_count}.",
      'If you expected more bands, re-upload the file and check it converted correctly.',
    ],
  },
  RL_CONVERSION_FAILED: {
    message: "'{file_name}' could not be normalized for ingestion ({reasons}).",
    actions: [
      'Check the raster opens in QGIS or with gdalinfo, then retry data loading.',
      'If it keeps failing, convert it manually with convert_raster.sh and re-upload the result.',
    ],
  },
  RL_UNIT_NOT_CONVERTIBLE: {
    message:
      "Band {band} of '{file_name}' is in '{original_unit}' but '{soil_property}' is stored in '{standard_unit}', and the conversion '{formula}' cannot be applied automatically.",
    actions: [
      'Only a single multiplication of every pixel can be applied during loading.',
      'Re-scale the raster yourself so its values are already in {standard_unit}, then re-upload the file.',
    ],
  },
  BL_RECORD_VALIDATION_FAILED: {
    message: "A record was rejected because field '{field}' {issue}.",
    actions: [
      "Check your source file: the '{field}' field contains an invalid value.",
      'Correct the data and re-upload the file, then retry data loading.',
    ],
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
  actions: ['Try again. If the problem persists, contact support.'],
};

const interpolate = (template: string, params: Record<string, unknown>): string =>
  template.replace(/\{(\w+)\}/g, (_, key) => (params[key] !== undefined ? String(params[key]) : `{${key}}`));

export const translateJobError = (code: string, params: Record<string, unknown> = {}): JobErrorMessage => {
  const { message, actions } = JOB_ERROR_MESSAGES[code] ?? FALLBACK;
  return {
    message: interpolate(message, params),
    actions: actions.map(a => interpolate(a, params)),
  };
};
