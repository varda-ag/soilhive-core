import { In } from 'typeorm';
import DatasetEntity from '../../entities/Dataset';
import { ExportJob } from '../../interfaces/Job';
import { RequestData } from '../../interfaces/RequestData';
import FilterService from '../../services/FilterService';
import { GISDataType } from '../../types/data';
import { runCancelableQuery } from '../../utils/cancelable-query';
import { getEntityManager } from '../../utils/data-source';
import { log } from '../../utils/logger';
import { getExportLimitsCheckTimeoutMs } from '../../utils/utils';
import { getTotalLayersCount, getTotalRecordsCount, validateFileFormats } from './exportHelpers';
import {
  assertWithinAreaLimit,
  assertWithinObservationLimit,
  assertWithinRasterLayerLimit,
  assertWithinXlsxRecordCap,
  getExportLimits,
} from './exportLimits';
import { VectorFileFormat } from './types';

type Check = (signal: AbortSignal) => Promise<void>;

const TIMED_OUT = Symbol('timed out');

/**
 * Throws the JobError the job would fail with when an Export is over its Export Limits or the XLSX
 * record cap (docs/adr/0070). `datasetSlugs` are the requested Datasets that exist for the caller.
 * Only the counts a limit needs run, and they share getExportLimitsCheckTimeoutMs(): past it the
 * Export goes through unchecked and the job judges it.
 */
export async function checkExportLimitsAtSubmission(requestData: RequestData, data: ExportJob, datasetSlugs: string[]): Promise<void> {
  const limits = await getExportLimits(requestData.entityManager, requestData.token ?? {});
  // The job's vector format, without refusing a missing one: that stays the job's to report.
  const { vectorFormat } = validateFileFormats(data.formats, false, false);
  const countRecords = limits.maxObservations !== null || vectorFormat === VectorFileFormat.XLSX;
  const countLayers = limits.maxRasterLayers !== null;
  if (limits.maxAreaM2 === null && !countRecords && !countLayers) return;

  const filter = await new FilterService().getFilterById(requestData, data.filter_id);
  assertWithinAreaLimit(limits, filter);
  if (!countRecords && !countLayers) return;

  const { vectorSlugs, rasterSlugs } = await splitByDataType(requestData, datasetSlugs);
  const checks: Check[] = [];
  if (countLayers && rasterSlugs.length) {
    checks.push(async signal => {
      const layers = await pooled(requestData, signal, rd => getTotalLayersCount(rd, { ...data, dataset_ids: rasterSlugs }));
      assertWithinRasterLayerLimit(limits, layers);
    });
  }
  if (countRecords && vectorSlugs.length) {
    checks.push(async signal => {
      const records = await pooled(requestData, signal, rd => getTotalRecordsCount(rd, { ...data, dataset_ids: vectorSlugs }));
      assertWithinObservationLimit(limits, records);
      assertWithinXlsxRecordCap(vectorFormat, records);
    });
  }
  if (!checks.length) return;

  const timeoutMs = getExportLimitsCheckTimeoutMs();
  if (!(await withinBudget(requestData.signal, timeoutMs, checks))) {
    log.warn('Export Limits not judged at submission in time; the job will judge them', {
      filterId: data.filter_id,
      datasetIds: datasetSlugs,
      timeoutMs,
    });
  }
}

// Split as the job splits them, by Data Type
async function splitByDataType(requestData: RequestData, slugs: string[]): Promise<{ vectorSlugs: string[]; rasterSlugs: string[] }> {
  if (!slugs.length) return { vectorSlugs: [], rasterSlugs: [] };
  const datasets = await requestData.entityManager.getRepository(DatasetEntity).find({
    select: { slug: true, gis_datatype: true },
    where: { slug: In(slugs) },
  });
  const ofTypes = (types: GISDataType[]) => datasets.filter(d => d.gis_datatype && types.includes(d.gis_datatype)).map(d => d.slug);
  return { vectorSlugs: ofTypes([GISDataType.POINT, GISDataType.POLYGONAL]), rasterSlugs: ofTypes([GISDataType.RASTER]) };
}

// A count on a pooled connection of its own, so counts run side by side and a cancel never reaches
// the request's transaction
const pooled = async (requestData: RequestData, signal: AbortSignal, count: (requestData: RequestData) => Promise<number>) =>
  runCancelableQuery(await getEntityManager(), signal, entityManager => count({ ...requestData, entityManager }));

// False when timeoutMs ran out first. Either way, or on a disconnect, whichever count is still
// running or waiting for a connection is cancelled.
async function withinBudget(disconnect: AbortSignal | undefined, timeoutMs: number, checks: Check[]): Promise<boolean> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  disconnect?.addEventListener('abort', cancel, { once: true });
  if (disconnect?.aborted) cancel();
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<typeof TIMED_OUT>(resolve => {
    timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
  });
  try {
    return (await Promise.race([Promise.all(checks.map(check => check(controller.signal))), timedOut])) !== TIMED_OUT;
  } finally {
    clearTimeout(timer);
    disconnect?.removeEventListener('abort', cancel);
    cancel();
  }
}
