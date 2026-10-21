import type { FileDescriptorMetadata } from 'types/backend';

/** A file's map-preview corners, and whether it is a raster that no CRS can place. */
export function georeferenceOf(metadata: FileDescriptorMetadata | undefined) {
  return {
    georeferenceWgs84: metadata?.georeference_wgs84,
    // null, not absent: an absent georeference only means the file predates them
    isUngeoreferencedRaster: metadata?.is_raster === true && metadata.georeference === null,
  };
}
