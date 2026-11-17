import { StatusCodes } from 'http-status-codes';
import { QueryFailedError } from 'typeorm';
import { THEME_CONFIG_ID } from '../constants/constants';
import AccessRequestEntity from '../entities/AccessRequest';
import AccessRequestItemEntity from '../entities/AccessRequestItem';
import { JsonStorage } from '../entities/JsonStorage';
import { RequestData } from '../interfaces/RequestData';
import {
  ACCESS_REQUEST_CAPABILITIES,
  ACCESS_REQUESTS_ENABLED_KEY,
  type AccessRequestCreateBody,
  type AccessRequestDecision,
  type AccessRequestItemStatus,
  type AccessRequestStatus,
  type AccessRequestView,
} from '../types/AccessRequests';
import { IngestionStatus } from '../types/data';
import { Capability } from '../types/enums';
import { datasetCapabilities, datasetExistsFor, getSubject, isPrivilegedCaller, subjectOf } from '../utils/auth';
import { ErrorResponse } from '../utils/error';
import EntitlementService from './EntitlementService';

const entitlementService = new EntitlementService();

interface DatasetRow {
  named: string;
  id: string;
  slug: string;
  name: string;
  visibility: 'public' | 'private';
  status: IngestionStatus;
}

interface ItemRow {
  request_id: string;
  dataset_id: string;
  status: AccessRequestItemStatus;
  granted: Capability[] | null;
  reason: string | null;
  decided_by: string | null;
  decided_at: Date | null;
  dataset_slug: string;
  dataset_name: string;
}

const invalid = (message: string) => new ErrorResponse(message, StatusCodes.BAD_REQUEST);

const notFound = () => new ErrorResponse('Access request not found', StatusCodes.NOT_FOUND);

const UNIQUE_VIOLATION = '23505';

const requestStatus = (items: ItemRow[]): AccessRequestStatus => {
  if (items.some(item => item.status === 'pending')) {
    return 'pending';
  }
  return items.length > 0 && items.every(item => item.status === 'withdrawn') ? 'withdrawn' : 'finished';
};

const sortedUnique = (capabilities: Capability[]): Capability[] => [...new Set(capabilities)].sort();

/** Access Requests: a Subject asks admins for access to private Datasets (docs/adr/0082). */
export default class AccessRequestService {
  /** Whether admins turned Access Requests on, in the theme config. Off unless set. */
  isEnabled = async (requestData: RequestData): Promise<boolean> => {
    const row = await requestData.entityManager.getRepository(JsonStorage).findOneBy({ id: THEME_CONFIG_ID });
    return (row?.data as Record<string, unknown> | undefined)?.[ACCESS_REQUESTS_ENABLED_KEY] === true;
  };

  createAccessRequest = async (requestData: RequestData, body: AccessRequestCreateBody): Promise<AccessRequestView> => {
    if (!(await this.isEnabled(requestData))) {
      throw new ErrorResponse('Access requests are turned off on this deployment', StatusCodes.FORBIDDEN);
    }
    if (isPrivilegedCaller(requestData.token)) {
      throw invalid('An admin already has access to every Dataset');
    }
    const capabilities = sortedUnique(body.capabilities);
    if (capabilities.length === 0 || !capabilities.every(c => ACCESS_REQUEST_CAPABILITIES.includes(c))) {
      throw invalid(`An access request asks for ${ACCESS_REQUEST_CAPABILITIES.join(' or ')}`);
    }

    const byName = await this.findDatasets(requestData, body.datasets);
    const datasets = new Map<string, DatasetRow>();
    for (const named of body.datasets) {
      const dataset = byName.get(named);
      if (!dataset) {
        // As getEntity words it, so an unpublished Dataset reads exactly as an unknown one (docs/adr/0057)
        throw new ErrorResponse(`Resource '${named}' not found`, StatusCodes.NOT_FOUND);
      }
      if (dataset.visibility === 'public') {
        throw invalid(`'${dataset.name}' is public and needs no access`);
      }
      const held = datasetCapabilities(requestData, dataset);
      if (capabilities.every(capability => held.includes(capability))) {
        throw invalid(`You already have that access to '${dataset.name}'`);
      }
      datasets.set(dataset.id, dataset);
    }

    const subject = getSubject(requestData);
    await this.assertNonePending(requestData, subject, [...datasets.values()]);

    const manager = requestData.entityManager;
    const { raw } = await manager
      .createQueryBuilder()
      .insert()
      .into(AccessRequestEntity)
      .values({ requested_by: subject, capabilities, message: body.message?.trim() || null })
      .returning('*')
      .execute();
    const request = raw[0] as AccessRequestEntity;
    try {
      await manager
        .createQueryBuilder()
        .insert()
        .into(AccessRequestItemEntity)
        .values([...datasets.keys()].map(dataset_id => ({ request_id: request.id, dataset_id, requested_by: subject })))
        .execute();
    } catch (error) {
      // A request for the same Dataset that committed after the check above
      if (error instanceof QueryFailedError && (error.driverError as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ErrorResponse('You already asked for access to one of these Datasets', StatusCodes.CONFLICT);
      }
      throw error;
    }
    return (await this.views(requestData, [request], false))[0]!;
  };

  /** The caller's own requests, newest first. */
  listMine = async (requestData: RequestData): Promise<AccessRequestView[]> => {
    const requests = await requestData.entityManager
      .getRepository(AccessRequestEntity)
      .find({ where: { requested_by: getSubject(requestData) }, order: { created_at: 'DESC' } });
    return this.views(requestData, requests, false);
  };

  /** For admins: the requests still waiting, oldest first, or the latest 200 of every state. */
  listForAdmins = async (requestData: RequestData, status: 'pending' | 'all'): Promise<AccessRequestView[]> => {
    const query = requestData.entityManager.getRepository(AccessRequestEntity).createQueryBuilder('request');
    if (status === 'pending') {
      query
        .where(`EXISTS (SELECT 1 FROM access_request_items item WHERE item.request_id = request.id AND item.status = 'pending')`)
        .orderBy('request.created_at', 'ASC');
    } else {
      query.orderBy('request.created_at', 'DESC').take(200);
    }
    return this.views(requestData, await query.getMany(), true);
  };

  /**
   * Decides some of a request's Datasets. An approval grants to the requester's Subject straight
   * away; a Dataset already decided is a 409, so two admins can't both decide it.
   */
  decide = async (requestData: RequestData, id: string, decisions: AccessRequestDecision[]): Promise<AccessRequestView> => {
    const manager = requestData.entityManager;
    const request = await manager.getRepository(AccessRequestEntity).findOneBy({ id });
    if (!request) {
      throw notFound();
    }
    const items = await this.items(requestData, [id]);
    const decidedBy = getSubject(requestData);
    for (const decision of decisions) {
      const item = items.find(candidate => candidate.dataset_slug === decision.dataset);
      if (!item) {
        throw new ErrorResponse(`'${decision.dataset}' is not in this access request`, StatusCodes.NOT_FOUND);
      }
      const granted = decision.approve ? sortedUnique(decision.capabilities ?? request.capabilities) : null;
      if (granted && (granted.length === 0 || !granted.every(capability => request.capabilities.includes(capability)))) {
        throw invalid('An approval grants what was asked for, or less');
      }
      // A raw UPDATE resolves to [rows, rowCount] (TypeORM's postgres driver)
      const [, updated]: [unknown, number] = await manager.query(
        `UPDATE access_request_items
         SET status = $3, granted = $4::jsonb, reason = $5, decided_by = $6, decided_at = now()
         WHERE request_id = $1 AND dataset_id = $2 AND status = 'pending'`,
        [
          id,
          item.dataset_id,
          decision.approve ? 'approved' : 'denied',
          granted ? JSON.stringify(granted) : null,
          decision.approve ? null : decision.reason?.trim() || null,
          decidedBy,
        ],
      );
      if (updated === 0) {
        throw new ErrorResponse(`'${item.dataset_name}' was already decided`, StatusCodes.CONFLICT);
      }
      if (granted) {
        await entitlementService.grantTo(requestData, request.requested_by, { datasets: { [item.dataset_slug]: granted } });
      }
    }
    return (await this.views(requestData, [request], true))[0]!;
  };

  /** The requester withdraws whatever in it is still pending. */
  withdraw = async (requestData: RequestData, id: string): Promise<void> => {
    const manager = requestData.entityManager;
    const request = await manager.getRepository(AccessRequestEntity).findOneBy({ id });
    if (!request || request.requested_by !== subjectOf(requestData)) {
      throw notFound();
    }
    const [, withdrawn]: [unknown, number] = await manager.query(
      `UPDATE access_request_items SET status = 'withdrawn' WHERE request_id = $1 AND status = 'pending'`,
      [id],
    );
    if (withdrawn === 0) {
      throw new ErrorResponse('Nothing in this access request is still pending', StatusCodes.CONFLICT);
    }
  };

  /**
   * Removes a purged Dataset from every pending request; a request left with nothing ends. Decided
   * ones stay as history: the Dataset's record survives a Purge (docs/adr/0082).
   *
   * Call it before the Entitlements are stripped, in the same transaction, as with
   * InviteService.dropFromPendingInvites: its delete waits for an approval under way, whose grant
   * is then there for the strip to remove, and an approval that comes after finds nothing pending.
   */
  dropDataset = async (requestData: RequestData, datasetId: string): Promise<void> => {
    const manager = requestData.entityManager;
    // A raw DELETE resolves to [rows, rowCount] (TypeORM's postgres driver)
    const [removed]: [{ request_id: string }[], number] = await manager.query(
      `DELETE FROM access_request_items WHERE dataset_id = $1 AND status = 'pending' RETURNING request_id`,
      [datasetId],
    );
    if (removed.length === 0) {
      return;
    }
    await manager.query(
      `DELETE FROM access_requests request
       WHERE request.id = ANY($1::uuid[])
         AND NOT EXISTS (SELECT 1 FROM access_request_items item WHERE item.request_id = request.id)`,
      [removed.map(row => row.request_id)],
    );
  };

  /** Each named slug that names a Dataset existing for the caller, with any old slug resolved (docs/adr/0057, 0071). */
  private findDatasets = async (requestData: RequestData, slugs: string[]): Promise<Map<string, DatasetRow>> => {
    const rows: DatasetRow[] = await requestData.entityManager.query(
      `SELECT sh.slug AS named, d.id, d.slug, d.name, d.visibility, d.status
       FROM slug_history sh
       JOIN datasets d ON d.id = sh.entity_id AND d.deleted_at IS NULL
       WHERE sh.slug = ANY($1::text[])`,
      [slugs],
    );
    return new Map(rows.filter(row => datasetExistsFor(requestData.token, row.status)).map(row => [row.named, row]));
  };

  private assertNonePending = async (requestData: RequestData, subject: string, datasets: DatasetRow[]): Promise<void> => {
    const pending: { request_id: string; dataset_id: string }[] = await requestData.entityManager.query(
      `SELECT request_id, dataset_id FROM access_request_items WHERE requested_by = $1 AND status = 'pending' AND dataset_id = ANY($2::uuid[])`,
      [subject, datasets.map(dataset => dataset.id)],
    );
    const first = pending[0];
    if (first) {
      const name = datasets.find(dataset => dataset.id === first.dataset_id)?.name;
      throw new ErrorResponse(`You already asked for access to '${name}'`, StatusCodes.CONFLICT, { pending_request_id: first.request_id });
    }
  };

  private items = async (requestData: RequestData, requestIds: string[]): Promise<ItemRow[]> =>
    requestData.entityManager.query(
      `SELECT item.*, d.slug AS dataset_slug, d.name AS dataset_name
       FROM access_request_items item
       JOIN datasets d ON d.id = item.dataset_id
       WHERE item.request_id = ANY($1::uuid[])
       ORDER BY d.name`,
      [requestIds],
    );

  private views = async (requestData: RequestData, requests: AccessRequestEntity[], forAdmins: boolean): Promise<AccessRequestView[]> => {
    if (requests.length === 0) {
      return [];
    }
    const items = await this.items(
      requestData,
      requests.map(request => request.id),
    );
    return requests.map(request => {
      const own = items.filter(item => item.request_id === request.id);
      return {
        id: request.id,
        requested_by: request.requested_by,
        capabilities: request.capabilities,
        message: request.message,
        status: requestStatus(own),
        created_at: request.created_at.toISOString(),
        items: own.map(item => ({
          dataset: { slug: item.dataset_slug, name: item.dataset_name },
          status: item.status,
          granted: item.granted,
          reason: item.reason,
          decided_at: item.decided_at?.toISOString() ?? null,
          ...(forAdmins ? { decided_by: item.decided_by } : {}),
        })),
      };
    });
  };
}
