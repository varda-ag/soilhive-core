import type { FileRasterBandDescriptor, Georeference } from './backend';

export interface SoilDataFile {
  id: string; // Populated from POST /files response
  file: File | null;
  name: string;
  progress: number;
  crs: string | null;
  inferredCrs?: string | null; // Inferred from the backend response after upload
  suppliedCrs?: string; // A CRS the user chose earlier, as the backend holds it; unlike inferredCrs it stays editable
  hasCustomCrs?: boolean; // File has CRS without an EPSG code
  error?: string | null;
  fieldNames?: string[];
  missingFields?: string[];
  extraFields?: string[];
  isRaster?: boolean;
  rasterBands?: FileRasterBandDescriptor[];
  georeferenceWgs84?: Georeference; // Where the file sits on a map, once its CRS is known
  isUngeoreferencedRaster?: boolean; // A raster no CRS can place: it has no geotransform
}
