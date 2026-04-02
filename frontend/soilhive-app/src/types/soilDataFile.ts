export interface SoilDataFile {
  tmpId: string; // client-generated, used as React key to keey track of upload progress
  id?: string; // populated from POST /files response
  file: File;
  progress: number;
  crs: string | null;
  inferredCrs?: string | null; /** inferred from the backend response after upload */
  error?: string | null;
}
