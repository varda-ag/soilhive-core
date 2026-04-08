import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import archiver from 'archiver';
import { FileStorage } from '@flystorage/file-storage';
import FileService from '../../services/FileService';
import { EXPORT_CONFIG } from './types';

/**
 * Create a temporary directory for export files
 */
export async function createTempDirectory(): Promise<string> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), EXPORT_CONFIG.TEMP_DIR_PREFIX));
  return tempDir;
}

/**
 * Zip all files in a directory.
 * @param sourceDir - Directory containing files to zip
 * @param outputPath - Full path for the output zip file (including .zip extension)
 */
export async function zipFiles(sourceDir: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: 9 }, // Maximum compression
    });

    output.on('close', () => {
      resolve();
    });

    archive.on('error', err => {
      reject(err);
    });

    archive.pipe(output);

    // Add all files from source directory
    archive.directory(sourceDir, false);

    archive.finalize();
  });
}

/**
 * Generate download path for the export file
 * Format: exports/<YYYY>/<MM>/SoilHive_<YYYYMMDD>_<HHMMSS>.zip
 */
export function generateDownloadPath(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const date = String(year) + '-' + month + '-' + String(now.getUTCDate()).padStart(2, '0');
  const time =
    String(now.getUTCHours()).padStart(2, '0') +
    '-' +
    String(now.getUTCMinutes()).padStart(2, '0') +
    '-' +
    String(now.getUTCSeconds()).padStart(2, '0');

  const filename = `SoilHive_${date}_${time}.zip`;
  return path.join(EXPORT_CONFIG.EXPORTS_BASE_PATH, String(year), month, filename);
}

/**
 * Move zip file to download folder using storage engine
 * @param localZipPath - Path to the local zip file
 * @param downloadPath - Destination path in storage
 */
export async function moveToDownloadFolder(localZipPath: string, downloadPath: string): Promise<string> {
  const storage: FileStorage = FileService.getStorageEngine();

  // Read the local zip file
  const fileContent = await fs.promises.readFile(localZipPath);

  // Write to storage engine (handles both local FS and S3)
  await storage.write(downloadPath, fileContent);

  // Return the download path (can be used to construct URL)
  return downloadPath;
}

/**
 * Clean up temporary files and directories
 * @param tempDir - Temporary directory to remove
 */
export async function cleanupTempFiles(tempDir: string): Promise<void> {
  if (!tempDir || !fs.existsSync(tempDir)) {
    return;
  }

  try {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  } catch (error) {
    console.error(`Failed to cleanup temp directory ${tempDir}:`, error);
    // Don't throw - cleanup failure shouldn't fail the job
  }
}

/**
 * Clean up temporary zip file
 * @param zipPath - Path to zip file to remove
 */
export async function cleanupTempZip(zipPath: string): Promise<void> {
  if (!zipPath || !fs.existsSync(zipPath)) {
    return;
  }

  try {
    await fs.promises.unlink(zipPath);
  } catch (error) {
    console.error(`Failed to cleanup temp zip ${zipPath}:`, error);
    // Don't throw - cleanup failure shouldn't fail the job
  }
}
