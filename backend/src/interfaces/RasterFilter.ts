/** See **Raster Filter Kind** in CONTEXT.md. Only `categorical` can be installed for now. */
export type RasterFilterKind = 'categorical' | 'continuous';

export interface RasterFilter {
  id: string;
  name: string;
  description: string;
  // Pixel value → label. Several values may share a label.
  mappings: Record<string, string> | null;
  active: boolean;
  kind: RasterFilterKind;
  // The File awaiting Installation: NULL once installed, as the install deletes it (docs/adr/0066)
  file_id: string | null;
  created_by: string | null;
  resolution_m: number | null;
  // Pixel value → pixel count of the installed band, nodata excluded. NULL for filters installed by the CLI.
  pixel_values: Record<string, number> | null;
  // Labels the source File carried, for values in pixel_values: a starting point for the mappings, never applied by itself
  suggested_mappings: Record<string, string> | null;
  created_at: Date;
  updated_at: Date | null;
}

export interface RasterFilterWithEnabled extends RasterFilter {
  enabled: boolean;
}

/** A Raster Filter that queries apply: active and enabled. `id` is its base table. */
export interface EnabledRasterFilterTable {
  id: string;
  resolutionM: number | null;
}

/**
 * Derived, never stored (docs/adr/0042 explains why): from the latest install job and whether the base table exists.
 */
export type RasterFilterInstallStatus = 'not_installed' | 'queued' | 'installing' | 'installed' | 'failed';

export interface RasterFilterInstallError {
  code: string;
  message: string;
  actions: string[];
  params: Record<string, unknown>;
  detail?: string;
}

export interface RasterFilterInstall {
  status: RasterFilterInstallStatus;
  job_id: string | null;
  progress_percentage?: number;
  progress_description?: string;
  errors: RasterFilterInstallError[];
}

export interface CreateRasterFilterInput {
  id: string;
  name: string;
  description: string;
  // A File's public id (its slug)
  file_id: string;
  // Optional when the File has a single band
  band?: number;
  kind: RasterFilterKind;
}

export interface PatchRasterFilterInput {
  active?: boolean;
  name?: string;
  description?: string;
}
