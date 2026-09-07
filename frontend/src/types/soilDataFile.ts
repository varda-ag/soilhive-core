export interface SoilDataFile {
  id: string; // Populated from POST /files response
  file: File | null;
  name: string;
  progress: number;
  crs: string | null;
  inferredCrs?: string | null; // Inferred from the backend response after upload
  hasCustomCrs?: boolean; // File has CRS without an EPSG code
  error?: string | null;
  fieldNames?: string[];
  missingFields?: string[];
  extraFields?: string[];
  isRaster?: boolean;
}
