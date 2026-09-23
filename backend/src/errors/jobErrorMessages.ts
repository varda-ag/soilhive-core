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

// The per-data-type ingestion guides. Actions embed these as bare URLs, which the error modal
// linkifies. The guide states the conditions a load enforces; these messages state the remedies -
// so a remedy lives here and nowhere else, and the guide links back rather than restating it.
const DOCS_BASE_URL = 'https://github.com/varda-ag/soilhive-core/blob/main/docs/data-model';
const VECTOR_DOCS_URL = `${DOCS_BASE_URL}/1a-vector-data-ingestion.md`;
const RASTER_DOCS_URL = `${DOCS_BASE_URL}/1b-raster-data-ingestion.md`;

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
    message: 'Your file contains only geometry - no soil measurement columns were found.',
    actions: ['Open the file and confirm it has at least one numeric data column besides the coordinate or geometry field.'],
  },
  FTD_MISSING_LAYER_NAME: {
    message: "File metadata is incomplete and can't be processed.",
    actions: ['Delete the file and re-upload it to regenerate its metadata. If this happens again, contact support.'],
  },
  FTD_MISSING_COLUMN_MAPPING: {
    message: "The column mapping for '{file_name}' has not been configured yet.",
    actions: ["Go to the dataset's mapping step, configure the columns of '{file_name}', save, then retry file staging."],
  },
  FTD_RASTER_NOT_SUPPORTED: {
    message: "This file is a raster and can't be loaded through file staging yet.",
    actions: ['Raster ingestion is not yet available through this pipeline.'],
  },
  FTD_INVALID_DEPTH_RANGE: {
    message: 'Column mapped to depth did not contain a valid range.',
    actions: [
      'Review your mapping to ensure you have mapped the depth related columns to depth if range, or min depth and max depth if separate values.',
      `Check your file is compliant with the guidelines in the documentation: ${VECTOR_DOCS_URL}#what-your-file-should-contain`,
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
    message: "The column mapping for '{file_name}' has not been configured yet.",
    actions: ["Go to the dataset's mapping step, configure the columns of '{file_name}', save, then retry data loading."],
  },
  BL_RECORD_WRITE_FAILED: {
    message: 'An error occurred while writing soil records to the database.',
    actions: [
      'Try starting data loading again.',
      `If it keeps failing, double check your data against the guidelines in the documentation at: ${VECTOR_DOCS_URL}#what-your-file-should-contain`,
    ],
  },
  RL_MAPPING_NOT_CONFIGURED: {
    message: "The band mapping for '{file_name}' has not been configured yet.",
    actions: [
      "Go to the dataset's mapping step, declare what each band of '{file_name}' measures, save, then retry data loading.",
      `What a band mapping declares, and how to fill it in: ${RASTER_DOCS_URL}#field-mapping--match-your-data`,
    ],
  },
  RL_INVALID_BAND: {
    message: "The band mapping for '{file_name}' refers to band {band}, which the file does not have (it has {band_count}).",
    actions: [
      "Open the mapping for '{file_name}' and map only bands 1 to {band_count}.",
      'If you expected more bands, re-upload the file and check it converted correctly.',
      `Which bands are loaded, and how they are numbered: ${RASTER_DOCS_URL}#field-mapping--match-your-data`,
    ],
  },
  RL_INVALID_REFERENCE_PERIOD: {
    message: "Band {band} of '{file_name}' declares a {field} of '{value}', which is not a valid date.",
    actions: [
      "Open the mapping for '{file_name}' and give band {band} a valid date in any of supported formats (YYYY, YYYY-MM, YYYY-MM-DD).",
    ],
  },
  RL_INVALID_DEPTH: {
    message: "Band {band} of '{file_name}' declares a {field} of {value}, which is not a whole number of centimetres from 0 to {limit}.",
    actions: [
      "Open the mapping for '{file_name}' and give band {band} a whole number of centimetres, from 0 to {limit}, as its {field}.",
      'Depths are stored as whole centimetres below the surface, so a fraction cannot be kept as written.',
    ],
  },
  RL_INVALID_DEPTH_RANGE: {
    message: "Band {band} of '{file_name}' declares a min depth of {min_depth}, which is not less than its max depth of {max_depth}.",
    actions: ["Open the mapping for '{file_name}' and give band {band} a min depth below its max depth."],
  },
  RL_ASSET_URL_UNSUPPORTED: {
    message: "An additional resource for band {band} of '{file_name}' is declared by URL, which cannot be loaded yet.",
    actions: [
      "Upload the resource as a file, then reference it in the band mapping by that file's id as file_id instead of a url.",
      'Downloading a resource straight from a URL is not implemented yet.',
    ],
  },
  RL_MISSING_ASSET_REFERENCE: {
    message: "An additional resource for band {band} of '{file_name}' names neither a file_id nor a url.",
    actions: ["Open the mapping for '{file_name}' and give every additional resource a file id as file_id, or remove the empty entry."],
  },
  RL_ASSET_FILE_NOT_FOUND: {
    message: "An additional resource for band {band} of '{file_name}' points at file '{file_id}', which does not exist.",
    actions: [
      "Check that '{file_id}' is the id of an uploaded file, and correct it in the band mapping.",
      'The referenced file may have been deleted since the mapping was written.',
    ],
  },
  RL_CONVERSION_FAILED: {
    message: "'{file_name}' could not be normalized for ingestion ({reasons}).",
    actions: [
      'Check if the raster opens in QGIS or with gdalinfo, then retry data loading.',
      'If it keeps failing, convert it to a Cloud Optimized GeoTIFF yourself, then re-upload it.',
      `What normalizing a raster involves: ${RASTER_DOCS_URL}#what-the-load-does-to-your-raster`,
    ],
  },
  RL_UNIT_NOT_CONVERTIBLE: {
    message:
      "Band {band} of '{file_name}' is in '{original_unit}' but '{soil_property}' is stored in '{standard_unit}', and the conversion '{formula}' cannot be applied automatically.",
    actions: [
      'Only a single multiplication of every pixel can be applied during loading.',
      'Re-scale the raster yourself so its values are already in {standard_unit}, then re-upload the file.',
      `What the load does to pixel values: ${RASTER_DOCS_URL}#what-the-load-does-to-your-raster`,
    ],
  },
  BL_RECORD_VALIDATION_FAILED: {
    message: "A record was rejected because field '{field}' {issue}.",
    actions: [
      "Check your source file: the '{field}' field contains an invalid value.",
      'Correct the data and re-upload the file, then retry data loading.',
    ],
  },
  RUN_FILE_NOT_FOUND: {
    message: 'The file supplying the aggregation areas could not be found.',
    actions: ['Re-upload the file and start the job again.'],
  },
  RUN_FILE_NOT_SPATIAL: {
    message: 'The file was uploaded as non-spatial, so no aggregation areas can be read from it.',
    actions: ['Re-upload the file as a spatial file, then start the job again.'],
  },
  RUN_FILE_IS_RASTER: {
    message: 'Aggregation areas must come from a vector file, but this file is a raster.',
    actions: ['Supply a file of polygon boundaries (GeoJSON, GeoPackage, or Shapefile) instead.'],
  },
  RUN_MISSING_EPSG: {
    message: 'The file has no coordinate reference system, so its boundaries cannot be positioned on the map.',
    actions: ['Open the file in the admin portal and set its EPSG code, then start the job again.'],
  },
  RUN_UNKNOWN_LABEL_FIELD: {
    message: "The file has no field named '{label_field}'.",
    actions: ['Check the field name against the file’s columns and start the job again with a name that exists.'],
  },
  RUN_NO_UNITS: {
    message: 'The file contains no geometries to aggregate over.',
    actions: ['Check the file contains polygon boundaries, then start the job again.'],
  },
  RUN_TOO_MANY_UNITS: {
    message: 'The file contains more than {max_units} boundaries, which is the most this job can report on.',
    actions: [
      'Split the file into batches of at most {max_units} boundaries and run one job per batch.',
      'Alternatively, ask your administrator to raise the limit.',
    ],
  },
  RUN_NON_POLYGON_GEOMETRY: {
    message: "{count} of the file's geometries are not polygons, so they cannot define an aggregation area.",
    actions: ['Remove the point and line geometries from the file, or supply a polygon-only file, then start the job again.'],
  },
  RUN_NO_GEOMETRIES: {
    message: 'The selected filter has no area of interest, so there is nothing to aggregate over.',
    actions: ['Draw or upload an area of interest, save the filter, then start the job again.'],
  },
  DR_DATASET_NOT_ENTITLED: {
    message: "You do not have preview access to dataset '{dataset_id}'.",
    actions: ['Remove that dataset from the request, or request preview access to it.'],
  },
  DR_UNKNOWN_STATISTICS_TYPE: {
    message: "'{statistics_type}' is not a kind of statistics this server can compute.",
    actions: ['Start the job again with one of: {supported}.'],
  },
  DR_INVALID_PARAMETERS: {
    message: 'The request parameters cannot be used: {reason}.',
    actions: ['Correct the parameters and submit the request again.'],
  },
  DR_UNKNOWN_SOIL_PROPERTY: {
    message: "Soil property '{soil_property}' no longer exists.",
    actions: ['Submit the request again with a soil property that exists.'],
  },
  DR_CLASS_DISTRIBUTION_TOO_LARGE: {
    message: 'This class distribution would have {rows} rows ({entries} class values), more than the {max_entries} this server returns.',
    actions: [
      'Group more years per window with a larger time_aggregation, or pool depths with depth_ranges none.',
      'Alternatively, use fewer classes, fewer areas or fewer datasets.',
    ],
  },
  SI_UNKNOWN_INDEX_TYPE: {
    message: "'{soil_index_type}' is not a soil index this server can compute.",
    actions: ['Start the job again with one of: {supported}.'],
  },
  EX_XLSX_TOO_MANY_RECORDS: {
    message: 'Your selection contains {record_count} records, more than the {max_records} Excel limit.',
    actions: [
      'Export as CSV or GeoPackage instead: neither has this limit.',
      'Alternatively, narrow the area of interest, the date or depth range, or the selected datasets until the selection is under {max_records} records.',
    ],
  },
  BD_TIMEOUT: {
    message: "Deleting '{dataset_name}' took too long and was stopped partway through.",
    actions: ['Try deleting again; if it keeps timing out, contact support'],
  },
  // FTD_GDAL_NOT_INSTALLED: reserved for future use - GdalCLI already emits a
  // 'GDAL_NOT_INSTALLED:' prefix on ENOENT so the code is detectable, but by
  // the time fileToDB runs GDAL has already been used (ogrinfo during metadata
  // extraction), making this condition practically unreachable there.
  // FTD_GDAL_NOT_INSTALLED: {
  //   message: 'File staging failed due to a server configuration problem.',
  //   action: 'Contact your system administrator - the GDAL geo-processing tools are missing from this server.',
  // },
};

const FALLBACK: JobErrorMessage = {
  message: 'An unexpected error occurred during processing.',
  actions: ['Try again. If the problem persists, contact support.'],
};

// The code recorded for a failure that is not a JobError (check-constraint violation, statement timeout, dropped connection)
export const UNEXPECTED_JOB_ERROR_CODE = 'UNEXPECTED_ERROR';

// pg-boss kills jobs that stopped checking in (heartbeatSeconds) or that outlived its expiry (expireInSeconds)
// from a maintenance query, so nothing lands in data.errors.
// These raw strings are the only explanation: here we translate them to something readable.
const QUEUE_REAP_MESSAGES: Record<string, string> = {
  'job heartbeat timeout': 'The job was interrupted before it could finish. Please try again.',
  'job timed out': 'The job ran for longer than allowed and was stopped. Try again with a smaller selection.',
};

// Returns user-facing copy for a pg-boss reap, or the message unchanged when it is not one.
export const translateQueueMessage = (message: string): string => QUEUE_REAP_MESSAGES[message] ?? message;

const interpolate = (template: string, params: Record<string, unknown>): string =>
  template.replace(/\{(\w+)\}/g, (_, key) => (params[key] !== undefined ? String(params[key]) : `{${key}}`));

export const translateJobError = (code: string, params: Record<string, unknown> = {}): JobErrorMessage => {
  const { message, actions } = JOB_ERROR_MESSAGES[code] ?? FALLBACK;
  return {
    message: interpolate(message, params),
    actions: actions.map(a => interpolate(a, params)),
  };
};
