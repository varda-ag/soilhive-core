import { EntityManager } from 'typeorm';
import { THEME_CONFIG_ID } from '../../constants/constants';
import { JsonStorage } from '../../entities/JsonStorage';
import { JobError } from '../../errors/JobError';
import { DataFilter } from '../../interfaces/DatasetFilter';
import { CommonJobData } from '../../interfaces/Job';
import { log } from '../../utils/logger';

// Stored as `exportLimits` in the theme config (docs/adr/0042). null means not limited.
export interface ExportLimits {
  maxAreaM2: number | null;
  maxObservations: number | null;
  maxRasterLayers: number | null;
  exemptAdmins: boolean;
}

export const NO_EXPORT_LIMITS: ExportLimits = { maxAreaM2: null, maxObservations: null, maxRasterLayers: null, exemptAdmins: false };

const LIMIT_KEYS = ['maxAreaM2', 'maxObservations', 'maxRasterLayers'] as const;

// The theme config has no schema: an invalid limit is ignored, the valid ones still apply.
export function parseExportLimits(raw: unknown): ExportLimits {
  if (raw === undefined || raw === null) return NO_EXPORT_LIMITS;
  if (typeof raw !== 'object') {
    log.warn('Ignoring invalid export limits', { value: JSON.stringify(raw) });
    return NO_EXPORT_LIMITS;
  }
  const value = raw as Record<string, unknown>;
  const limits: ExportLimits = { ...NO_EXPORT_LIMITS, exemptAdmins: value['exemptAdmins'] === true };
  for (const key of LIMIT_KEYS) {
    const limit = value[key];
    if (limit === undefined || limit === null) continue;
    if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
      limits[key] = limit;
    } else {
      log.warn('Ignoring invalid export limit', { key, value: JSON.stringify(limit) });
    }
  }
  return limits;
}

export async function getExportLimits(
  entityManager: EntityManager,
  submitter: Partial<Pick<CommonJobData, 'isDataAdmin' | 'isSuperAdmin'>>,
): Promise<ExportLimits> {
  const row = await entityManager.getRepository(JsonStorage).findOneBy({ id: THEME_CONFIG_ID });
  const limits = parseExportLimits((row?.data as { exportLimits?: unknown } | undefined)?.exportLimits);
  const isAdmin = Boolean(submitter.isDataAdmin || submitter.isSuperAdmin);
  return limits.exemptAdmins && isAdmin ? NO_EXPORT_LIMITS : limits;
}

const km2 = (m2: number): string => (m2 / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 });
const count = (n: number): string => n.toLocaleString('en-US');

// A Filter with no geometries has no bounded area, so it exceeds any area limit.
export function assertWithinAreaLimit(limits: ExportLimits, filter: DataFilter): void {
  if (limits.maxAreaM2 === null) return;
  if (!filter.geometryIds.length) {
    throw new JobError('EX_AREA_LIMIT_NO_AOI', { max_area_km2: km2(limits.maxAreaM2) });
  }
  if (filter.area > limits.maxAreaM2) {
    throw new JobError('EX_AREA_LIMIT_EXCEEDED', { area_km2: km2(filter.area), max_area_km2: km2(limits.maxAreaM2) });
  }
}

export function assertWithinRasterLayerLimit(limits: ExportLimits, layerCount: number): void {
  if (limits.maxRasterLayers !== null && layerCount > limits.maxRasterLayers) {
    throw new JobError('EX_RASTER_LAYER_LIMIT_EXCEEDED', { layer_count: count(layerCount), max_layers: count(limits.maxRasterLayers) });
  }
}

export function assertWithinObservationLimit(limits: ExportLimits, recordCount: number): void {
  if (limits.maxObservations !== null && recordCount > limits.maxObservations) {
    throw new JobError('EX_OBSERVATION_LIMIT_EXCEEDED', { record_count: count(recordCount), max_records: count(limits.maxObservations) });
  }
}
