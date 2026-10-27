import { StatusCodes } from 'http-status-codes';
import { In } from 'typeorm';
import RasterFilterEntity from '../entities/RasterFilter';
import FileEntity from '../entities/File';
import DatasetFileMappingEntity from '../entities/DatasetFileMapping';
import RasterLayerAssetEntity from '../entities/RasterLayerAsset';
import { RequestData } from '../interfaces/RequestData';
import { CreateRasterFilterInput, PatchRasterFilterInput, RasterFilterInstall, RasterFilterWithEnabled } from '../interfaces/RasterFilter';
import { RasterFilterInstallJob } from '../interfaces/Job';
import { RasterFileMetadata } from '../interfaces/File';
import { ErrorResponse } from '../utils/error';
import { EntityType } from '../types/data';
import { JobQueues } from '../types/enums';
import { getEntity } from '../utils/slugs';
import { getSubject, isPrivilegedCaller } from '../utils/auth';
import { bumpCacheEpoch } from '../utils/cache-epoch';
import { rasterFilterTables } from '../utils/raster';
import { assertNoUnfinishedInstall, getInstallStates, takenRasterFilterNames } from '../data-layer/RasterFilterInstalls';
import { getActiveRasterFilters, withEnabled } from '../data-layer/EnabledRasterFilters';
import JobService from './JobService';

// The id is the base table's name, and the longest overview's (o_32_<id>) must fit Postgres' 63 characters
const RASTER_FILTER_ID_PATTERN = /^[a-z][a-z0-9_]{0,57}$/;

// Seconds before an install job becomes visible to workers, so the POST that enqueued it has committed
const INSTALL_START_AFTER_SECONDS = 5;

// How long DELETE waits for in-flight queries to release a filter's tables before giving up
const DELETE_LOCK_TIMEOUT = '5s';

/** A Raster Filter as GET returns it to a caller that is not Privileged. */
export interface PublicRasterFilter {
  id: string;
  name: string;
  description: string;
  mappings: Record<string, number> | null;
  kind: string;
  resolution_m: number | null;
  active: boolean;
  enabled: boolean;
  created_at: Date;
  updated_at: Date | null;
}

/** A Raster Filter as GET returns it to a Privileged caller. `file_id` is the File's slug. */
export interface AdminRasterFilter extends PublicRasterFilter {
  file_id: string | null;
  created_by: string | null;
  pixel_values: Record<string, number> | null;
  suggested_mappings: Record<string, number> | null;
  install: RasterFilterInstall;
}

export default class RasterFilterService {
  /**
   * The catalog. A caller that is not Privileged sees only the Raster Filters users can select
   * (active and enabled), without the install's workings: the same rule as Datasets (docs/adr/0034).
   */
  async getRasterFilters(requestData: RequestData): Promise<Array<PublicRasterFilter | AdminRasterFilter>> {
    const entities = await requestData.entityManager.getRepository(RasterFilterEntity).find({ order: { id: 'ASC' } });
    const decorated = await RasterFilterService.decorateWithEnable(requestData, entities);
    if (!isPrivilegedCaller(requestData.token)) {
      return decorated.filter(f => f.active && f.enabled).map(toPublic);
    }
    return this.toAdmin(requestData, decorated);
  }

  /** One Raster Filter, absent (404) to a caller that is not Privileged unless it is active and enabled. */
  getRasterFilter = async (requestData: RequestData, id: string): Promise<PublicRasterFilter | AdminRasterFilter> => {
    const [decorated] = await RasterFilterService.decorateWithEnable(requestData, [await this.findRasterFilter(requestData, id)]);
    if (!isPrivilegedCaller(requestData.token)) {
      if (!decorated!.active || !decorated!.enabled) {
        throw new ErrorResponse(`Resource '${id}' not found`, StatusCodes.NOT_FOUND);
      }
      return toPublic(decorated!);
    }
    const [admin] = await this.toAdmin(requestData, [decorated!]);
    return admin!;
  };

  /**
   * Creates a Raster Filter and enqueues its Installation from an uploaded raster File, which the
   * install consumes (docs/adr/0066). Labels come later, through putMappings.
   */
  createRasterFilter = async (requestData: RequestData, input: CreateRasterFilterInput): Promise<AdminRasterFilter> => {
    const { id, name, description, kind } = input;
    if (!RASTER_FILTER_ID_PATTERN.test(id)) {
      throw new ErrorResponse(
        `Raster filter id '${id}' must start with a lowercase letter and hold only lowercase letters, digits and underscores, 58 characters at most`,
        StatusCodes.BAD_REQUEST,
      );
    }
    const repo = requestData.entityManager.getRepository(RasterFilterEntity);
    if (await repo.findOneBy({ id })) {
      throw new ErrorResponse(`Raster filter '${id}' already exists`, StatusCodes.CONFLICT);
    }
    const taken = await takenRasterFilterNames(requestData.entityManager, id);
    if (taken.length > 0) {
      throw new ErrorResponse(
        `Raster filter id '${id}' collides with existing database objects: ${taken.join(', ')}`,
        StatusCodes.CONFLICT,
      );
    }

    const { file, band } = await this.resolveSourceFile(requestData, input.file_id, input.band);

    const entity = repo.create({
      id,
      name,
      description,
      kind,
      file_id: file.id,
      created_by: getSubject(requestData),
      active: false,
      mappings: null,
    });
    await repo.save(entity);

    await new JobService().createJob(
      requestData,
      { type: JobQueues.RASTER_FILTER_INSTALL, raster_filter_id: id, band } as RasterFilterInstallJob,
      { startAfter: INSTALL_START_AFTER_SECONDS },
    );

    return (await this.getRasterFilter(requestData, id)) as AdminRasterFilter;
  };

  /** Updates the admin-editable fields. The id is the table name, so it never changes. */
  patchRasterFilter = async (requestData: RequestData, id: string, input: PatchRasterFilterInput): Promise<AdminRasterFilter> => {
    const repo = requestData.entityManager.getRepository(RasterFilterEntity);
    const entity = await this.findRasterFilter(requestData, id);
    const activeChanged = input.active !== undefined && input.active !== entity.active;
    repo.merge(entity, {
      ...(input.active !== undefined && { active: input.active }),
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
    });
    await repo.save(entity);
    if (activeChanged) {
      // Changes which Raster Filters every node applies
      await bumpCacheEpoch();
    }
    return (await this.getRasterFilter(requestData, id)) as AdminRasterFilter;
  };

  /**
   * Replaces a Raster Filter's labels: `{ label: pixel value }`. Only an installed filter can be
   * labelled, and only with values its raster holds. The CLI's filters have no recorded values, so
   * theirs go unchecked. An empty object unlabels the filter, which disables it.
   */
  putMappings = async (requestData: RequestData, id: string, mappings: Record<string, number>): Promise<AdminRasterFilter> => {
    const repo = requestData.entityManager.getRepository(RasterFilterEntity);
    const entity = await this.findRasterFilter(requestData, id);
    const [install] = (await getInstallStates(requestData.entityManager, [id])).values();
    if (install!.status !== 'installed') {
      throw new ErrorResponse(
        `Raster filter '${id}' is not installed (${install!.status}), so it has nothing to label yet`,
        StatusCodes.CONFLICT,
      );
    }

    const values = Object.values(mappings);
    const repeated = values.filter((value, index) => values.indexOf(value) !== index);
    if (repeated.length > 0) {
      throw new ErrorResponse(
        `Each pixel value takes one label, but ${[...new Set(repeated)].join(', ')} have more`,
        StatusCodes.BAD_REQUEST,
      );
    }
    if (entity.pixel_values) {
      const absent = values.filter(value => !(String(value) in entity.pixel_values!));
      if (absent.length > 0) {
        throw new ErrorResponse(`Raster filter '${id}' has no pixels with value(s) ${absent.join(', ')}`, StatusCodes.BAD_REQUEST);
      }
    }

    entity.mappings = mappings;
    await repo.save(entity);
    // The first labels enable the filter, and an empty object disables it
    await bumpCacheEpoch();
    return (await this.getRasterFilter(requestData, id)) as AdminRasterFilter;
  };

  /**
   * Drops a Raster Filter's tables and deletes it. Refused while it is active, so no node is still
   * querying its tables, and while an install is unfinished. Filters saved with its values keep them:
   * they are ignored once it is no longer enabled. The source File of a failed install is left for
   * orphan cleanup.
   */
  deleteRasterFilter = async (requestData: RequestData, id: string): Promise<void> => {
    const { entityManager } = requestData;
    const entity = await this.findRasterFilter(requestData, id);
    if (entity.active) {
      throw new ErrorResponse(`Raster filter '${id}' is active: deactivate it before deleting it`, StatusCodes.CONFLICT);
    }
    await assertNoUnfinishedInstall(entityManager, id);

    // A query still reading the tables holds a lock the drop must wait for: give up rather than stall every query queued behind it
    await entityManager.query(`SET LOCAL lock_timeout = '${DELETE_LOCK_TIMEOUT}'`);
    try {
      for (const table of rasterFilterTables(id)) {
        await entityManager.query(`DROP TABLE IF EXISTS "${table}"`);
      }
    } catch (error: any) {
      // lock_not_available
      if (error?.code === '55P03') {
        throw new ErrorResponse(`Raster filter '${id}' is in use: try again shortly`, StatusCodes.CONFLICT);
      }
      throw error;
    }
    // Hard: the id is free again for a new Raster Filter
    await entityManager.getRepository(RasterFilterEntity).delete({ id });
    await bumpCacheEpoch();
  };

  /** The Raster Filters users can select: active and enabled. */
  getActiveRasterFilters = async (requestData: RequestData): Promise<RasterFilterWithEnabled[]> =>
    getActiveRasterFilters(requestData.entityManager);

  /** `enabled`: the backing raster table exists and there are labels to select. */
  static decorateWithEnable = async (requestData: RequestData, input: RasterFilterEntity[]): Promise<RasterFilterWithEnabled[]> =>
    withEnabled(requestData.entityManager, input);

  private findRasterFilter = async (requestData: RequestData, id: string): Promise<RasterFilterEntity> => {
    const entity = await requestData.entityManager.getRepository(RasterFilterEntity).findOneBy({ id });
    if (!entity) {
      throw new ErrorResponse(`Resource '${id}' not found`, StatusCodes.NOT_FOUND);
    }
    return entity;
  };

  /**
   * The raster File a new Raster Filter installs from, and the band to install: given, or the only one
   * a single-band File has. The install deletes the File, so it must belong to nothing else.
   */
  private resolveSourceFile = async (
    requestData: RequestData,
    slug: string,
    requestedBand: number | undefined,
  ): Promise<{ file: FileEntity; band: number }> => {
    const { entityManager } = requestData;
    const file = await getEntity(requestData, FileEntity, EntityType.FILE, slug);
    const metadata = file.metadata as RasterFileMetadata | undefined;
    if (!metadata?.is_raster) {
      throw new ErrorResponse(`File '${slug}' is not a raster`, StatusCodes.BAD_REQUEST);
    }
    if (requestedBand === undefined && metadata.band_count !== 1) {
      throw new ErrorResponse(
        `File '${slug}' has ${metadata.band_count} bands: choose the one to install with 'band'`,
        StatusCodes.BAD_REQUEST,
      );
    }
    const band = requestedBand ?? 1;
    if (band > metadata.band_count) {
      throw new ErrorResponse(`File '${slug}' has ${metadata.band_count} band(s), so it has no band ${band}`, StatusCodes.BAD_REQUEST);
    }
    const [mapping, asset, filter] = await Promise.all([
      entityManager.getRepository(DatasetFileMappingEntity).findOneBy({ file_id: file.id }),
      entityManager.getRepository(RasterLayerAssetEntity).findOneBy({ file_id: file.id }),
      entityManager.getRepository(RasterFilterEntity).findOneBy({ file_id: file.id }),
    ]);
    if (mapping || asset || filter) {
      throw new ErrorResponse(
        `File '${slug}' is already used by ${filter ? `raster filter '${filter.id}'` : 'a dataset'}, and installing a raster filter deletes its file`,
        StatusCodes.CONFLICT,
      );
    }
    return { file, band };
  };

  private toAdmin = async (requestData: RequestData, filters: RasterFilterWithEnabled[]): Promise<AdminRasterFilter[]> => {
    const { entityManager } = requestData;
    const installs = await getInstallStates(
      entityManager,
      filters.map(f => f.id),
    );
    const fileIds = filters.map(f => f.file_id).filter((id): id is string => id !== null);
    const files =
      fileIds.length > 0 ? await entityManager.getRepository(FileEntity).find({ where: { id: In(fileIds) }, withDeleted: true }) : [];
    const slugs = new Map(files.map(f => [f.id, f.slug]));
    return filters.map(f => ({
      ...toPublic(f),
      file_id: f.file_id ? (slugs.get(f.file_id) ?? null) : null,
      created_by: f.created_by,
      pixel_values: f.pixel_values,
      suggested_mappings: f.suggested_mappings,
      install: installs.get(f.id)!,
    }));
  };
}

const toPublic = (f: RasterFilterWithEnabled): PublicRasterFilter => ({
  id: f.id,
  name: f.name,
  description: f.description,
  mappings: f.mappings,
  kind: f.kind,
  resolution_m: f.resolution_m,
  active: f.active,
  enabled: f.enabled,
  created_at: f.created_at,
  updated_at: f.updated_at,
});
