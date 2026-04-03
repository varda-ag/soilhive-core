export interface SoilDataFile {
  id: string; // populated from POST /files response
  file: File;
  progress: number;
  crs: string | null;
  inferredCrs?: string | null; /** inferred from the backend response after upload */
  error?: string | null;
}
