import { createHash, randomBytes } from 'node:crypto';
import { StatusCodes } from 'http-status-codes';
import { In } from 'typeorm';
import InviteEntity from '../entities/Invite';
import InviteRedemptionEntity from '../entities/InviteRedemption';
import { JsonStorage } from '../entities/JsonStorage';
import { RequestData } from '../interfaces/RequestData';
import { EntitlementScope, type CapabilityGrants, type Entitlements } from '../types/Entitlements';
import { Capability } from '../types/enums';
import {
  INVITE_CAPABILITIES,
  INVITE_DEFAULT_DAYS,
  INVITE_MAX_DAYS,
  type InviteCreateBody,
  type InviteCreated,
  type InviteStatus,
  type InviteView,
} from '../types/Invites';
import { getSubject, isMachineCaller, isPrivilegedCaller, subjectOf } from '../utils/auth';
import { ErrorResponse } from '../utils/error';
import { existingDatasetsByName } from '../utils/slugs';
import { emailClaim, getUserinfoEmail } from '../utils/userinfo';
import EntitlementService from './EntitlementService';

const entitlementService = new EntitlementService();

const DAY_MS = 24 * 60 * 60 * 1000;

const SCOPES = Object.values(EntitlementScope);

/** Null-prototype, as in EntitlementService: a key can be "__proto__". */
const grantsMap = (): CapabilityGrants => Object.create(null);

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

const keysOf = (grants: Entitlements, scope: EntitlementScope): string[] => Object.keys(grants[scope] ?? {});

const invalid = (message: string) => new ErrorResponse(message, StatusCodes.BAD_REQUEST);

const notFound = () => new ErrorResponse('Invite not found', StatusCodes.NOT_FOUND);

/** `jane@example.com` → `j•••@example.com`: enough for Jane to tell which account, not enough to hand out her address. */
export const maskEmail = (email: string): string => {
  const at = email.lastIndexOf('@');
  return at < 1 ? '•••' : `${email[0]}•••${email.slice(at)}`;
};

const statusOf = (invite: InviteEntity, now = new Date()): InviteStatus => {
  if (invite.used_at) {
    return 'used';
  }
  return invite.expires_at <= now ? 'expired' : 'pending';
};

const toView = (invite: InviteEntity, redemptions: InviteRedemptionEntity[]): InviteView => ({
  id: invite.id,
  grants: invite.grants,
  recipient: invite.recipient,
  reusable: invite.reusable,
  status: statusOf(invite),
  expires_at: invite.expires_at.toISOString(),
  created_by: invite.created_by,
  created_at: invite.created_at.toISOString(),
  redemptions: redemptions.map(({ subject, redeemed_at }) => ({ subject, redeemed_at: redeemed_at.toISOString() })),
});

/** Invites: Entitlements held back until someone redeems them (docs/adr/0081, 0082). */
export default class InviteService {
  createInvite = async (requestData: RequestData, body: InviteCreateBody): Promise<InviteCreated> => {
    const grants = await this.checkGrants(requestData, body.grants);
    const recipient = emailClaim(body.recipient) ?? null;
    const reusable = body.reusable ?? false;
    if (recipient && reusable) {
      throw invalid('An Invite with a recipient is used up by that recipient, so it cannot be reusable');
    }
    const days = body.expires_in_days ?? INVITE_DEFAULT_DAYS;
    if (!Number.isInteger(days) || days < 1 || days > INVITE_MAX_DAYS) {
      throw invalid(`An Invite expires in 1 to ${INVITE_MAX_DAYS} days`);
    }

    const token = randomBytes(32).toString('base64url');
    const { raw } = await requestData.entityManager
      .createQueryBuilder()
      .insert()
      .into(InviteEntity)
      .values({
        token_hash: hashToken(token),
        grants,
        recipient,
        reusable,
        expires_at: new Date(Date.now() + days * DAY_MS),
        created_by: getSubject(requestData),
        created_by_privileged: isPrivilegedCaller(requestData.token),
      })
      .returning('*')
      .execute();
    return { ...toView(raw[0] as InviteEntity, []), token };
  };

  /**
   * Grants what the Invite holds to the caller's own Subject, whole or not at all. A single-use
   * Invite is used up by the conditional update, so two redemptions racing for it can't both win.
   * Redeeming again what one already redeemed succeeds and changes nothing.
   */
  redeemInvite = async (requestData: RequestData, token: string): Promise<Entitlements> => {
    const manager = requestData.entityManager;
    const invite = await manager.getRepository(InviteEntity).findOneBy({ token_hash: hashToken(token) });
    if (!invite) {
      throw notFound();
    }
    const subject = getSubject(requestData);
    const status = statusOf(invite);
    if (status === 'used' && (await manager.getRepository(InviteRedemptionEntity).existsBy({ invite_id: invite.id, subject }))) {
      return invite.grants;
    }
    if (status !== 'pending') {
      throw new ErrorResponse(`This Invite has ${status === 'used' ? 'already been used' : 'expired'}`, StatusCodes.GONE);
    }

    if (invite.recipient) {
      await this.assertRecipient(requestData, invite.recipient);
    }
    if (!invite.created_by_privileged) {
      await this.assertCreatorStillHolds(requestData, invite);
    }
    const grants = await this.lockGrants(requestData, invite);
    await manager.createQueryBuilder().insert().into(InviteRedemptionEntity).values({ invite_id: invite.id, subject }).orIgnore().execute();
    await entitlementService.grantSelf(requestData, grants);
    return grants;
  };

  /**
   * The Invite's grants as they stand now, under a row lock held until the redeem's transaction
   * ends; the same statement uses up a single-use Invite. Not the copy read before the checks: a
   * Purge or a config item delete may have stripped the Invite since, and a grant made from that
   * copy would outlive the cleanup. The cleanup waits for this lock (see dropFromPendingInvites).
   */
  private lockGrants = async (requestData: RequestData, invite: InviteEntity): Promise<Entitlements> => {
    const manager = requestData.entityManager;
    const live = `"id" = $1 AND "deleted_at" IS NULL AND "expires_at" > now()`;
    let rows: { grants: Entitlements }[];
    if (invite.reusable) {
      rows = await manager.query(`SELECT "grants" FROM "invites" WHERE ${live} FOR SHARE`, [invite.id]);
    } else {
      // A raw UPDATE resolves to [rows, rowCount] (TypeORM's postgres driver)
      [rows] = await manager.query(
        `UPDATE "invites" SET "used_at" = now(), "updated_at" = now() WHERE ${live} AND "used_at" IS NULL RETURNING "grants"`,
        [invite.id],
      );
    }
    const locked = rows[0];
    if (!locked) {
      // Used up, withdrawn, stripped to nothing or expired since it was read
      throw new ErrorResponse('This Invite is no longer available', StatusCodes.GONE);
    }
    return locked.grants;
  };

  /**
   * The caller's view of the Invites naming a config item or Dataset, newest first; withdrawn ones
   * are left out. Only a Privileged caller may list without naming one.
   */
  listInvites = async (
    requestData: RequestData,
    filter: { configId?: string | undefined; datasetId?: string | undefined },
  ): Promise<InviteView[]> => {
    const privileged = isPrivilegedCaller(requestData.token);
    if (!privileged && !filter.configId) {
      throw invalid('config_id is required');
    }
    if (!privileged && filter.configId) {
      entitlementService.assertConfig(requestData, filter.configId, Capability.WRITE);
    }

    const query = requestData.entityManager.getRepository(InviteEntity).createQueryBuilder('invite').orderBy('invite.created_at', 'DESC');
    if (filter.configId) {
      query.andWhere(`invite.grants->'configs' ? :configId`, { configId: filter.configId });
    }
    if (filter.datasetId) {
      const slugs = await entitlementService.resolveSlugs(requestData, EntitlementScope.DATASETS, filter.datasetId);
      query.andWhere(`invite.grants->'datasets' ?| array[:...slugs]`, { slugs });
    }
    const invites = (await query.getMany()).filter(invite => this.isVisible(requestData, invite));
    return this.withRedemptions(requestData, invites);
  };

  withdrawInvite = async (requestData: RequestData, id: string): Promise<void> => {
    const repo = requestData.entityManager.getRepository(InviteEntity);
    const invite = await repo.findOneBy({ id });
    if (!invite || !this.isVisible(requestData, invite)) {
      throw notFound();
    }
    await repo.softDelete({ id });
  };

  /**
   * Removes an entity from every Invite not yet used up, as a Purge or a plugin config item delete
   * destroys its Entitlements; one left granting nothing is withdrawn (docs/adr/0082).
   *
   * Call it before the Entitlements are stripped, in the same transaction. Its update waits for a
   * redeem that holds an Invite's row (lockGrants), so that redeem's grant is committed by the time
   * the strip runs, and a redeem that comes after reads the Invite without the entity. The other
   * way round, a redeem between the two steps would leave a grant the strip never saw.
   */
  dropFromPendingInvites = async (requestData: RequestData, scope: EntitlementScope, slug: string): Promise<void> => {
    const keys = await entitlementService.resolveSlugs(requestData, scope, slug);
    const manager = requestData.entityManager;
    await manager.query(
      `UPDATE "invites" SET "grants" = jsonb_set("grants", array[$1::text], ("grants"->$1::text) - $2::text[]), "updated_at" = now()
       WHERE "deleted_at" IS NULL AND "used_at" IS NULL AND ("grants"->$1::text) ?| $2::text[]`,
      [scope, keys],
    );
    await manager.query(
      `UPDATE "invites" SET "deleted_at" = now()
       WHERE "deleted_at" IS NULL AND "used_at" IS NULL
         AND COALESCE("grants"->'datasets', '{}'::jsonb) = '{}'::jsonb
         AND COALESCE("grants"->'configs', '{}'::jsonb) = '{}'::jsonb`,
    );
  };

  /**
   * What a creator may put into an Invite: only what they could grant directly (docs/adr/0082).
   * Dataset grants are stored under each Dataset's current slug.
   */
  private checkGrants = async (requestData: RequestData, grants: Entitlements | undefined): Promise<Entitlements> => {
    const checked: Entitlements = {};
    for (const scope of SCOPES) {
      const scoped = grants?.[scope] ?? {};
      const keys = Object.keys(scoped);
      if (keys.length === 0) {
        continue;
      }
      const allowed: readonly Capability[] = INVITE_CAPABILITIES[scope];
      for (const key of keys) {
        const capabilities = scoped[key];
        if (!Array.isArray(capabilities) || capabilities.length === 0 || !capabilities.every(c => allowed.includes(c))) {
          throw invalid(`An Invite grants ${allowed.join(' or ')} on ${scope}`);
        }
      }
      checked[scope] =
        scope === EntitlementScope.CONFIGS ? await this.checkConfigs(requestData, scoped) : await this.checkDatasets(requestData, scoped);
    }
    if (SCOPES.every(scope => keysOf(checked, scope).length === 0)) {
      throw invalid('An Invite must grant something');
    }
    return checked;
  };

  private checkConfigs = async (requestData: RequestData, scoped: CapabilityGrants): Promise<CapabilityGrants> => {
    const keys = Object.keys(scoped);
    const rows = await requestData.entityManager.getRepository(JsonStorage).find({ select: { id: true }, where: { id: In(keys) } });
    const existing = new Set(rows.map(row => row.id));
    const checked = grantsMap();
    for (const key of keys) {
      if (!existing.has(key)) {
        throw new ErrorResponse(`Config '${key}' not found`, StatusCodes.NOT_FOUND);
      }
      entitlementService.assertConfig(requestData, key, Capability.WRITE);
      checked[key] = [...new Set(scoped[key])].sort();
    }
    return checked;
  };

  private checkDatasets = async (requestData: RequestData, scoped: CapabilityGrants): Promise<CapabilityGrants> => {
    if (!isPrivilegedCaller(requestData.token)) {
      throw new ErrorResponse('Only an admin can invite people to a Dataset', StatusCodes.FORBIDDEN);
    }
    const byName = await existingDatasetsByName(requestData, Object.keys(scoped));
    const checked = grantsMap();
    for (const [named, capabilities] of Object.entries(scoped)) {
      const dataset = byName.get(named);
      if (!dataset) {
        throw new ErrorResponse(`Resource '${named}' not found`, StatusCodes.NOT_FOUND);
      }
      checked[dataset.slug] = [...new Set([...(checked[dataset.slug] ?? []), ...capabilities])].sort();
    }
    return checked;
  };

  /** The recipient against the person's email: the access token's, else the identity provider's (docs/adr/0081). */
  private assertRecipient = async (requestData: RequestData, recipient: string): Promise<void> => {
    const token = requestData.token!;
    const hint = maskEmail(recipient);
    const refused = new ErrorResponse(`This Invite is for ${hint}. Sign in with that account to redeem it.`, StatusCodes.FORBIDDEN, {
      recipient_hint: hint,
    });
    if (isMachineCaller(token)) {
      throw refused;
    }
    const email = emailClaim(token.email) ?? (await getUserinfoEmail(token));
    if (email?.toLowerCase() !== recipient.toLowerCase()) {
      throw refused;
    }
  };

  /** A non-admin creator's config grants hold only while they still hold `write` on each. */
  private assertCreatorStillHolds = async (requestData: RequestData, invite: InviteEntity): Promise<void> => {
    for (const key of keysOf(invite.grants, EntitlementScope.CONFIGS)) {
      if (!(await entitlementService.holdsConfig(requestData, invite.created_by, key, Capability.WRITE))) {
        throw new ErrorResponse(
          'This Invite no longer works: whoever created it can no longer share what it grants',
          StatusCodes.FORBIDDEN,
        );
      }
    }
  };

  /** Its creator, and whoever could have created it (docs/adr/0082). */
  private isVisible = (requestData: RequestData, invite: InviteEntity): boolean =>
    isPrivilegedCaller(requestData.token) ||
    invite.created_by === subjectOf(requestData) ||
    (keysOf(invite.grants, EntitlementScope.DATASETS).length === 0 &&
      keysOf(invite.grants, EntitlementScope.CONFIGS).every(key => entitlementService.canConfig(requestData, key, Capability.WRITE)));

  private withRedemptions = async (requestData: RequestData, invites: InviteEntity[]): Promise<InviteView[]> => {
    if (invites.length === 0) {
      return [];
    }
    const redemptions = await requestData.entityManager
      .getRepository(InviteRedemptionEntity)
      .find({ where: { invite_id: In(invites.map(invite => invite.id)) }, order: { redeemed_at: 'ASC' } });
    return invites.map(invite =>
      toView(
        invite,
        redemptions.filter(redemption => redemption.invite_id === invite.id),
      ),
    );
  };
}
