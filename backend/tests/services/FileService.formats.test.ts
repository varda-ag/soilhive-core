import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import { EntityManager } from 'typeorm';
import FileService from '../../src/services/FileService';
import { VectorFileMetadata } from '../../src/interfaces/File';
import { getEntityManager } from '../../src/utils/data-source';
import { RequestData } from '../../src/interfaces/RequestData';
import { Token } from '../../src/interfaces/Token';
import { writableAssets } from '../assets';

const vectorFilesPassPath = writableAssets('vector_files/pass');
const vectorFilesFailPath = writableAssets('vector_files/fail');

const mockToken: Token = {
  sub: 'test-user-id',
  email: 'test@example.com',
  scope: 'user',
  raw: 'mock-token',
  isSuperAdmin: false,
  isDataAdmin: false,
  isInternalRequest: false,
};

/**
 * Every fixture here is derived from `basic-soil-example_wkt.csv`, so they all carry the same
 * 15 point features and the same soil columns (depth, licence, pH, SOC_g_kg, TN_g_kg, clay_pct,
 * sand_pct, CEC_cmolc_kg). That makes "did the right file get picked out of the archive" a
 * question about the driver and the column names, not about the data differing between formats.
 *
 * `soil_points.xsd` ships beside `soil_points.gml` deliberately: without it GDAL writes a
 * `soil_points.gfs` next to the source on every read, dirtying the assets folder.
 */
const SOIL_COLUMNS = ['depth', 'licence', 'pH', 'SOC_g_kg', 'TN_g_kg', 'clay_pct', 'sand_pct'];

describe('FileService - vector formats', () => {
  let fileService: FileService;
  let entityManager: EntityManager;
  let requestData: RequestData;

  beforeAll(async () => {
    fileService = new FileService();
    entityManager = await getEntityManager();
    requestData = { entityManager, token: mockToken, entitlements: {} };
  });

  beforeEach(() => {
    process.env.LOCAL_STORAGE_ROOT_FOLDER = vectorFilesPassPath;
    requestData = { entityManager, token: mockToken, entitlements: {} };
  });

  describe('formats uploaded directly', () => {
    it('reads a GML file, its CRS and its soil columns', async () => {
      const metadata = (await fileService.extractMetadata(requestData, 'soil_points.gml')) as VectorFileMetadata;

      expect(metadata.is_raster).toBe(false);
      expect(metadata.driver).toBe('GML');
      expect(metadata.epsg).toBe(4326);
      expect(metadata.geometry_detected).toBe(true);
      expect(metadata.field_names).toEqual(expect.arrayContaining(SOIL_COLUMNS));
    });

    /**
     * Requires the LIBKML driver (`gdal-driver-libkml`, installed in the runtime image).
     *
     * GDAL has two KML drivers and they do not read the same file the same way: LIBKML exposes a
     * placemark's `ExtendedData` as real columns, while the built-in `KML` driver returns only
     * `Name` and `Description` and drops every soil column, whatever flavour of `ExtendedData`
     * the file uses. So the field assertion below is the point of this test — it fails on a
     * machine missing libkml, which is exactly the misconfiguration worth catching.
     *
     * LIBKML reports the geometry type as `Geometry` rather than `Point`, which `getDataLayer`
     * accepts via ALLOWED_GEOMETRY_TYPES.
     */
    it('reads a KML file, its CRS and its soil columns', async () => {
      const metadata = (await fileService.extractMetadata(requestData, 'soil_points.kml')) as VectorFileMetadata;

      expect(metadata.is_raster).toBe(false);
      expect(metadata.driver).toBe('LIBKML');
      expect(metadata.epsg).toBe(4326);
      expect(metadata.geometry_detected).toBe(true);
      expect(metadata.field_names).toEqual(expect.arrayContaining(SOIL_COLUMNS));
    });

    it('reads a KMZ file, its CRS and its soil columns', async () => {
      // A .kmz is a zip, but it does not end in `.zip`, so it never takes the archive path: it goes
      // straight to GDAL, where LIBKML opens the container itself. `gdalinfo` reports no bands for
      // one, so it correctly falls through to the vector path rather than being read as a raster.
      const metadata = (await fileService.extractMetadata(requestData, 'soil_points.kmz')) as VectorFileMetadata;

      expect(metadata.is_raster).toBe(false);
      expect(metadata.driver).toBe('LIBKML');
      expect(metadata.epsg).toBe(4326);
      expect(metadata.geometry_detected).toBe(true);
      expect(metadata.field_names).toEqual(expect.arrayContaining(SOIL_COLUMNS));
    });
  });

  describe('ZIP archives', () => {
    it('picks the CSV out of an archive that also holds an unrelated text file', async () => {
      // The archive has two entries, so this exercises the extension search rather than the
      // single-entry shortcut. Tabular formats are last in that search, and nothing else matches.
      const metadata = (await fileService.extractMetadata(requestData, 'csv_and_txt.zip')) as VectorFileMetadata;

      expect(metadata.is_raster).toBe(false);
      expect(metadata.driver).toBe('CSV');
      expect(metadata.geometry_detected).toBe(true); // built from the WKT column
      expect(metadata.field_names).toEqual(expect.arrayContaining(['WKT', ...SOIL_COLUMNS]));
    });

    it('prefers the shapefile over a sidecar CSV in the same archive', async () => {
      // The ordering guard: geospatial extensions are searched before tabular ones, so an
      // attribute lookup shipped beside a shapefile cannot be mistaken for the dataset.
      const metadata = (await fileService.extractMetadata(requestData, 'shp_and_csv.zip')) as VectorFileMetadata;

      expect(metadata.driver).toBe('ESRI Shapefile');
      expect(metadata.epsg).toBe(4326);
      expect(metadata.geometry_detected).toBe(true);
      // Shapefile field names are truncated to 10 characters, hence CEC_cmolc_ rather than CEC_cmolc_kg.
      expect(metadata.field_names).toEqual(expect.arrayContaining(SOIL_COLUMNS));
      expect(metadata.field_names).not.toContain('operator'); // only in attributes.csv
    });

    it('picks the File Geodatabase out of an archive that also holds a text file', async () => {
      const metadata = (await fileService.extractMetadata(requestData, 'gdb_and_txt.zip')) as VectorFileMetadata;

      expect(metadata.driver).toBe('OpenFileGDB');
      expect(metadata.geometry_detected).toBe(true);
      expect(metadata.field_names).toEqual(expect.arrayContaining(SOIL_COLUMNS));
    });

    it('picks the KMZ out of an archive that also holds a text file', async () => {
      const metadata = (await fileService.extractMetadata(requestData, 'kmz_and_txt.zip')) as VectorFileMetadata;

      expect(metadata.driver).toBe('LIBKML');
      expect(metadata.geometry_detected).toBe(true);
      expect(metadata.field_names).toEqual(expect.arrayContaining(SOIL_COLUMNS));
    });

    it('resolves a single-entry archive without consulting the extension list', async () => {
      // One entry takes the shortcut before the extension search, which is how a .gdb folder
      // zipped on its own arrives.
      const metadata = (await fileService.extractMetadata(requestData, 'soil_points_gdb.zip')) as VectorFileMetadata;

      expect(metadata.driver).toBe('OpenFileGDB');
      expect(metadata.field_names).toEqual(expect.arrayContaining(SOIL_COLUMNS));
    });

    it('rejects an archive holding no data file at all', async () => {
      // The error lists the extensions actually searched, so it stays correct as formats are added.
      process.env.LOCAL_STORAGE_ROOT_FOLDER = vectorFilesFailPath;
      await expect(fileService.extractMetadata(requestData, 'no_data.zip')).rejects.toThrow(
        'No recognized geospatial file found in ZIP archive',
      );
    });
  });

  /**
   * The archive search used to run on local storage only. S3 addressed a ZIP as `/vsizip/vsis3/…`
   * and handed GDAL the archive root, where it auto-detects a lone shapefile or .gdb and fails on
   * anything else — so a zipped CSV, GML or KMZ loaded on a local-storage deployment and was
   * rejected on an S3 one, from the same upload. Both modes now go through
   * extractZipAndFindMainFile, so the same archive has to give the same answer either way.
   *
   * Keyed with the `vector_files/pass/` prefix because the S3 fixtures are seeded under the
   * bucket's root folder rather than a per-test directory.
   */
  describe('archives resolve identically on either storage mode', () => {
    const archives: [string, string][] = [
      ['csv_and_txt.zip', 'CSV'],
      ['gdb_and_txt.zip', 'OpenFileGDB'],
      ['kmz_and_txt.zip', 'LIBKML'],
      // Auto-detected by GDAL at the archive root too, so these two passed before the fix as well.
      ['shp_and_csv.zip', 'ESRI Shapefile'],
      ['soil_points_gdb.zip', 'OpenFileGDB'],
    ];

    it.each(archives)('%s resolves to the %s driver on S3', async (archive, driver) => {
      process.env.STORAGE_MODE = 's3';
      const metadata = (await fileService.extractMetadata(requestData, `vector_files/pass/${archive}`)) as VectorFileMetadata;

      expect(metadata.driver).toBe(driver);
      expect(metadata.field_names).toEqual(expect.arrayContaining(SOIL_COLUMNS));
    });
  });
});
