export interface SoilDataFile {
  id: string; // populated from POST /files response
  file: File | null;
  name: string;
  progress: number;
  crs: string | null;
  inferredCrs?: string | null; /** inferred from the backend response after upload */
  error?: string | null;
  fieldNames?: string[];
  missingFields?: string[];
  extraFields?: string[];
}
