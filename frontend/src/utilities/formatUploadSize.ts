// 1 GB = 1000 MB here — for display only, matching how MAX_UPLOAD_SIZE_MB is authored (a plain
// MB count), not the binary MiB math ConfigService.getMaxUploadSizeBytes() uses on the backend.
export function formatUploadSize(sizeMB: number): string {
  if (sizeMB < 1000) return `${sizeMB} MB`;
  const sizeGB = Math.round((sizeMB / 1000) * 100) / 100;
  return `${sizeGB} GB`;
}
