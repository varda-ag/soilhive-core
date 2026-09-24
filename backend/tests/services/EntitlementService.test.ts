import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import { EntityManager } from 'typeorm';
import { RequestData } from '../../src/interfaces/RequestData';
import { getEntityManager } from '../../src/utils/data-source';
import { getSubject } from '../../src/utils/auth';
import { EVERYONE } from '../../src/constants/constants';
import { Token } from '../../src/interfaces/Token';
import { addDataset, addLicense } from '../../src/utils/mock';
import EntitlementService from '../../src/services/EntitlementService';
import DatasetService from '../../src/services/DatasetService';
import { EntitlementScope, ConfigSubkeyScope, CapabilityGrants } from '../../src/types/Entitlements';
import { Capability } from '../../src/types/enums';
import DatasetEntity from '../../src/entities/Dataset';
import LicenseEntity from '../../src/entities/License';
import { log } from '../../src/utils/logger';

const mockToken: Token = {
  sub: 'test-user-id',
  email: 'test@example.com',
  scope: 'user',
  raw: 'mock-token',
  isSuperAdmin: false,
  isDataAdmin: false,
  isInternalRequest: false,
};

let entityManager: EntityManager;
let requestData: RequestData;

const service = new EntitlementService();

describe('EntitlementService', () => {
  beforeAll(async () => {
    entityManager = await getEntityManager();
    requestData = {
      entityManager,
      token: mockToken,
      entitlements: {},
    };
  });

  beforeEach(async () => {
    await addDataset('dataset-1', [0, 0, 1, 1]);
    await addDataset('dataset-2', [0, 0, 1, 1]);
    await addDataset('dataset-3', [0, 0, 1, 1]);
    const datasetService = new DatasetService();
    // Update all datasets to "private" visibility to test entitlements
    await datasetService.updateDataset(requestData, 'dataset-1', { visibility: 'private' });
    await datasetService.updateDataset(requestData, 'dataset-2', { visibility: 'private' });
    await datasetService.updateDataset(requestData, 'dataset-3', { visibility: 'private' });
    // Update dataset-1 slug to test slug history handling
    await datasetService.updateDataset(requestData, 'dataset-1', { name: 'dataset-1-renamed' });
    // Fill DB with test entitlements, nested under "datasets" (see ADR-0032)
    await entityManager.query(`
      INSERT INTO entitlements (id, data) VALUES
      ('everyone', '{"datasets": {"dataset-1": ["download"]}}'),
      ('user1@example.com', '{"datasets": {"dataset-1": ["obfuscate_as_points", "preview", "download"]}}'),
      ('user2@example.com', '{"datasets": {"dataset-2": ["obfuscate_as_points"]}}'),
      ('user3@example.com', '{"datasets": {"dataset-3": ["obfuscate_as_points"], "dataset-1": ["obfuscate_as_points"]}}'),
      ('user4@example.com', '{"datasets": {"spatial_filter": ["download"]}}')
    `);
  });

  // Grants below are seeded under 'dataset-1', the slug from *before* the rename in this
  // beforeEach — getUserEntitlements is expected to expand them across the entity's whole slug
  // history, so a grant made before a rename is visible under both the old and the new slug.
  it.each([
    [undefined, { 'dataset-1': [Capability.DOWNLOAD], 'dataset-1-renamed': [Capability.DOWNLOAD] }],
    ['not-existing', { 'dataset-1': [Capability.DOWNLOAD], 'dataset-1-renamed': [Capability.DOWNLOAD] }],
    [
      'user1@example.com',
      {
        'dataset-1': [Capability.DOWNLOAD, Capability.OBFUSCATE_AS_POINTS, Capability.PREVIEW],
        'dataset-1-renamed': [Capability.DOWNLOAD, Capability.OBFUSCATE_AS_POINTS, Capability.PREVIEW],
      },
    ],
    [
      'user2@example.com',
      {
        'dataset-1': [Capability.DOWNLOAD],
        'dataset-1-renamed': [Capability.DOWNLOAD],
        'dataset-2': [Capability.OBFUSCATE_AS_POINTS],
      },
    ],
    [
      'user3@example.com',
      {
        'dataset-1': [Capability.DOWNLOAD, Capability.OBFUSCATE_AS_POINTS],
        'dataset-1-renamed': [Capability.DOWNLOAD, Capability.OBFUSCATE_AS_POINTS],
        'dataset-3': [Capability.OBFUSCATE_AS_POINTS],
      },
    ],
  ])('should retrieve user entitlements by ID, expanded across the entity slug history', async (id, expectedDatasets) => {
    const entitlements = await service.getUserEntitlements(requestData, id);
    expect(entitlements).toEqual({ datasets: expectedDatasets, configs: {} });
  });

  it('leaves a key with no matching Dataset untouched, alongside one that does get expanded', async () => {
    await entityManager.query(`
      INSERT INTO entitlements (id, data) VALUES ('user5@example.com', '{"datasets": {"totally-unrelated-key": ["preview"]}}')
    `);

    const entitlements = await service.getUserEntitlements(requestData, 'user5@example.com');
    // 'dataset-1' (EVERYONE's grant) is expanded to every slug the dataset has had; the unrelated key is passed through as-is.
    expect(entitlements).toEqual({
      datasets: {
        'dataset-1': [Capability.DOWNLOAD],
        'dataset-1-renamed': [Capability.DOWNLOAD],
        'totally-unrelated-key': [Capability.PREVIEW],
      },
      configs: {},
    });
  });

  it('treats a "__proto__" grant key as an ordinary entry instead of crashing on it', async () => {
    // A row keyed literally "__proto__" is a real, storable JSON key — JSON.parse never treats it
    // as prototype pollution — but the merge accumulator used to be a plain {}, whose inherited
    // __proto__ accessor made this key look "already populated" and crash on a non-iterable spread.
    // jsonb_set (not `||`, which would replace the whole "datasets" object and drop 'dataset-1')
    // nests it alongside the top-level beforeEach's 'dataset-1' grant, so slug-history expansion
    // still runs and exercises `expandAcrossSlugHistory`'s own accumulator too, not just the merge.
    await entityManager.query(`
      UPDATE entitlements SET data = jsonb_set(data, '{datasets,__proto__}', '["preview"]'::jsonb)
      WHERE id = 'everyone'
    `);

    const entitlements = await service.getUserEntitlements(requestData, 'unrelated-caller@example.com');

    // Computed key, not a literal `'__proto__': ...` property — the latter sets the object
    // literal's own prototype (the same special-casing this whole bug is about), rather than
    // creating an own property, and would defeat this assertion.
    expect(entitlements.datasets).toEqual({
      ['__proto__']: [Capability.PREVIEW],
      'dataset-1': [Capability.DOWNLOAD],
      'dataset-1-renamed': [Capability.DOWNLOAD],
    });
    expect(Object.getPrototypeOf(entitlements.datasets)).toBeNull();
  });

  it('skips a malformed (non-array) capability grant instead of throwing, and still returns well-formed keys', async () => {
    // beforeEach already seeds an 'everyone' row (under `datasets`); merge `configs` into it here
    // rather than inserting a fresh row, which would collide on the primary key.
    await entityManager.query(`
      UPDATE entitlements SET data = data || '{"configs": {"probe_config": {"poisoned": true}, "good_config": ["read"]}}'::jsonb
      WHERE id = 'everyone'
    `);

    const entitlements = await service.getUserEntitlements(requestData, 'unrelated-victim@example.com');

    expect(entitlements.configs).toEqual({ good_config: [Capability.READ] });
  });

  it('merges a grant under a historical slug with one already under the current slug for the same Dataset', async () => {
    await entityManager.query(`
      INSERT INTO entitlements (id, data) VALUES
      ('user6@example.com', '{"datasets": {"dataset-1": ["preview"], "dataset-1-renamed": ["download"]}}')
    `);

    const entitlements = await service.getUserEntitlements(requestData, 'user6@example.com');
    expect(entitlements).toEqual({
      datasets: {
        'dataset-1': [Capability.DOWNLOAD, Capability.PREVIEW],
        'dataset-1-renamed': [Capability.DOWNLOAD, Capability.PREVIEW],
      },
      configs: {},
    });
  });

  it('expands a grant on a renamed entity of a type other than Dataset (e.g. License)', async () => {
    const license = await addLicense('license-a');
    await entityManager.query(
      `INSERT INTO entitlements (id, data) VALUES ('user7@example.com', jsonb_build_object('datasets', jsonb_build_object($1::text, '["preview"]'::jsonb)))`,
      [license.slug],
    );

    const licenseRepo = entityManager.getRepository(LicenseEntity);
    await licenseRepo.update({ id: license.id }, { name: 'license-a-renamed' });
    const renamed = await licenseRepo.findOneByOrFail({ id: license.id });
    expect(renamed.slug).not.toBe(license.slug);

    const entitlements = await service.getUserEntitlements(requestData, 'user7@example.com');
    expect(entitlements).toEqual({
      datasets: {
        'dataset-1': [Capability.DOWNLOAD], // EVERYONE's grant, always merged in
        'dataset-1-renamed': [Capability.DOWNLOAD],
        [license.slug]: [Capability.PREVIEW],
        [renamed.slug]: [Capability.PREVIEW],
      },
      configs: {},
    });
  });

  it('resolves a grant made before a chain of renames to every slug in the chain, not just the final one', async () => {
    const datasetService = new DatasetService();
    const originalSlug = 'dataset-2';

    await entityManager.query(
      `INSERT INTO entitlements (id, data) VALUES ('user8@example.com', jsonb_build_object('datasets', jsonb_build_object($1::text, '["preview"]'::jsonb)))`,
      [originalSlug],
    );

    const afterFirstRename = await datasetService.updateDataset(requestData, originalSlug, { name: 'dataset-2-renamed-once' });
    const afterSecondRename = await datasetService.updateDataset(requestData, afterFirstRename.slug, { name: 'dataset-2-renamed-twice' });
    const afterThirdRename = await datasetService.updateDataset(requestData, afterSecondRename.slug, { name: 'dataset-2-renamed-thrice' });
    // Three distinct slugs, none equal to the original — otherwise this test would not exercise a chain.
    expect(new Set([originalSlug, afterFirstRename.slug, afterSecondRename.slug, afterThirdRename.slug]).size).toBe(4);

    const entitlements = await service.getUserEntitlements(requestData, 'user8@example.com');
    expect(entitlements).toEqual({
      datasets: {
        'dataset-1': [Capability.DOWNLOAD], // EVERYONE's grant, always merged in
        'dataset-1-renamed': [Capability.DOWNLOAD],
        [originalSlug]: [Capability.PREVIEW],
        [afterFirstRename.slug]: [Capability.PREVIEW],
        [afterSecondRename.slug]: [Capability.PREVIEW],
        [afterThirdRename.slug]: [Capability.PREVIEW],
      },
      configs: {},
    });
  });

  it.each([
    ['not-existing', {}],
    [
      'dataset-1',
      {
        everyone: [Capability.DOWNLOAD],
        'user1@example.com': [Capability.OBFUSCATE_AS_POINTS, Capability.PREVIEW, Capability.DOWNLOAD],
        'user3@example.com': [Capability.OBFUSCATE_AS_POINTS],
      },
    ],
    ['dataset-2', { 'user2@example.com': [Capability.OBFUSCATE_AS_POINTS] }],
    ['spatial_filter', { 'user4@example.com': [Capability.DOWNLOAD] }],
  ])('should retrieve entity entitlements', async (slug, expectedEntitlements) => {
    const entitlements = await service.getEntityEntitlements(requestData, EntitlementScope.DATASETS, slug);
    expect(entitlements).toEqual(expectedEntitlements);
  });

  it('treats a subject id of "__proto__" as an ordinary grantee instead of hijacking the result map', async () => {
    // A subject id can legitimately be "__proto__" (e.g. a non-admin WRITE holder adding it as an
    // extra grantee in a follow-up PUT — see EntitlementService.ts's assertCanWriteConfigEntitlement
    // doc comment). entitiesToEntitlements's `acc[id] = capabilities` is a plain assignment, which on
    // a plain {} would silently repoint the accumulator's own prototype instead of storing an entry.
    await entityManager.query(`
      INSERT INTO entitlements (id, data) VALUES ('__proto__', '{"datasets": {"dataset-2": ["read"]}}')
    `);

    const entitlements = await service.getEntityEntitlements(requestData, EntitlementScope.DATASETS, 'dataset-2');

    expect(entitlements).toEqual({
      'user2@example.com': [Capability.OBFUSCATE_AS_POINTS],
      ['__proto__']: [Capability.READ],
    });
    expect(Object.getPrototypeOf(entitlements)).toBeNull();
  });

  it.each([
    ['not-existing-entity', { 'user@example.com': [Capability.OBFUSCATE_AS_POINTS] } as CapabilityGrants],
    ['another-not-existing-entity', {}],
    ['dataset-1', {}],
    [
      'dataset-1',
      {
        everyone: [Capability.DOWNLOAD],
        'user1@example.com': [Capability.OBFUSCATE_AS_POINTS],
        'another@example.com': [Capability.OBFUSCATE_AS_POINTS],
      } as CapabilityGrants,
    ],
    ['dataset-2', { 'another@example.com': [Capability.OBFUSCATE_AS_POINTS] } as CapabilityGrants],
  ])('should set entitlements to entity and return the updated entitlements', async (slug: string, payload: CapabilityGrants) => {
    const result = await service.setEntityEntitlements(requestData, EntitlementScope.DATASETS, slug, payload);
    expect(result).toEqual(payload);
    const entitlements = await service.getEntityEntitlements(requestData, EntitlementScope.DATASETS, slug);
    expect(entitlements).toEqual(payload);
  });

  describe('deleteEntityEntitlements', () => {
    // The fixture renames dataset-1 to dataset-1-renamed and only then inserts entitlements
    // keyed under the now-historical "dataset-1", which is exactly the case that used to be
    // missed: the read side resolves slug history, so those keys were honoured, but the
    // delete side stripped only the slug it was handed.
    it('strips keys stored under a historical slug when given the current one', async () => {
      await service.deleteEntityEntitlements(requestData, EntitlementScope.DATASETS, 'dataset-1-renamed');

      const entitlements = await service.getEntityEntitlements(requestData, EntitlementScope.DATASETS, 'dataset-1-renamed');
      expect(entitlements).toEqual({});
    });

    it('strips keys when given a historical slug', async () => {
      await service.deleteEntityEntitlements(requestData, EntitlementScope.DATASETS, 'dataset-1');

      const entitlements = await service.getEntityEntitlements(requestData, EntitlementScope.DATASETS, 'dataset-1');
      expect(entitlements).toEqual({});
    });

    it('leaves entitlements to other entities untouched', async () => {
      await service.deleteEntityEntitlements(requestData, EntitlementScope.DATASETS, 'dataset-1-renamed');

      // user3 held both dataset-1 and dataset-3; only the dataset-1 key should be gone
      expect(await service.getEntityEntitlements(requestData, EntitlementScope.DATASETS, 'dataset-2')).toEqual({
        'user2@example.com': [Capability.OBFUSCATE_AS_POINTS],
      });
      expect(await service.getEntityEntitlements(requestData, EntitlementScope.DATASETS, 'dataset-3')).toEqual({
        'user3@example.com': [Capability.OBFUSCATE_AS_POINTS],
      });
      // A key with no slug_history row at all must survive
      expect(await service.getEntityEntitlements(requestData, EntitlementScope.DATASETS, 'spatial_filter')).toEqual({
        'user4@example.com': [Capability.DOWNLOAD],
      });
    });

    it('keeps rows whose data becomes empty', async () => {
      await service.deleteEntityEntitlements(requestData, EntitlementScope.DATASETS, 'dataset-1-renamed');

      // user1 held only dataset-1, so its "datasets" scope is now {} — the row is a subject
      // record, not an entitlement, and is deliberately retained
      const rows = await entityManager.query(`SELECT data FROM entitlements WHERE id = 'user1@example.com'`);
      expect(rows).toHaveLength(1);
      expect(rows[0].data).toEqual({ datasets: {} });
    });

    it('strips a non-entity key that has no slug history', async () => {
      await service.deleteEntityEntitlements(requestData, EntitlementScope.DATASETS, 'spatial_filter');

      expect(await service.getEntityEntitlements(requestData, EntitlementScope.DATASETS, 'spatial_filter')).toEqual({});
    });

    it('is idempotent and a no-op for an unknown slug', async () => {
      await service.deleteEntityEntitlements(requestData, EntitlementScope.DATASETS, 'dataset-1-renamed');
      await service.deleteEntityEntitlements(requestData, EntitlementScope.DATASETS, 'dataset-1-renamed');
      await service.deleteEntityEntitlements(requestData, EntitlementScope.DATASETS, 'never-existed');

      expect(await service.getEntityEntitlements(requestData, EntitlementScope.DATASETS, 'dataset-2')).toEqual({
        'user2@example.com': [Capability.OBFUSCATE_AS_POINTS],
      });
    });

    it('only touches rows that hold one of the slugs', async () => {
      // xmin is the transaction that last wrote the row: unchanged means the row was not
      // rewritten at all. Without the WHERE predicate the update rewrites and row-locks
      // every row in the table, which a caller inside a long transaction would hold for
      // that transaction's whole duration.
      const before = await entityManager.query(`SELECT xmin::text FROM entitlements WHERE id = 'user2@example.com'`);

      await service.deleteEntityEntitlements(requestData, EntitlementScope.DATASETS, 'dataset-1-renamed');

      const after = await entityManager.query(`SELECT xmin::text FROM entitlements WHERE id = 'user2@example.com'`);
      expect(after[0].xmin).toEqual(before[0].xmin);
    });

    describe('configs scope', () => {
      const configKey = 'dashboard-1';

      beforeEach(async () => {
        await entityManager.query(`
          INSERT INTO entitlements (id, data) VALUES ('config-user1@example.com', '{"configs": {"${configKey}": ["read"]}}')
        `);
      });

      it('gets entitlements set for a config key', async () => {
        const entitlements = await service.getEntityEntitlements(requestData, EntitlementScope.CONFIGS, configKey);
        expect(entitlements).toEqual({ 'config-user1@example.com': [Capability.READ] });
      });

      it('skips a malformed (non-array) capability grant instead of returning it as-is', async () => {
        await entityManager.query(`
          INSERT INTO entitlements (id, data) VALUES ('config-user2@example.com', '{"configs": {"${configKey}": {"poisoned": true}}}')
        `);

        const entitlements = await service.getEntityEntitlements(requestData, EntitlementScope.CONFIGS, configKey);

        expect(entitlements).toEqual({ 'config-user1@example.com': [Capability.READ] });
      });

      it('sets entitlements for a config key and returns the updated entitlements', async () => {
        const payload = { 'config-user1@example.com': [Capability.READ], 'config-user2@example.com': [Capability.WRITE] };
        const result = await service.setEntityEntitlements(requestData, EntitlementScope.CONFIGS, configKey, payload);
        expect(result).toEqual(payload);
        expect(await service.getEntityEntitlements(requestData, EntitlementScope.CONFIGS, configKey)).toEqual(payload);
      });

      it('deletes entitlements for a config key without touching the datasets scope', async () => {
        await service.deleteEntityEntitlements(requestData, EntitlementScope.CONFIGS, configKey);

        expect(await service.getEntityEntitlements(requestData, EntitlementScope.CONFIGS, configKey)).toEqual({});
        // datasets scope entitlements, seeded in the top-level beforeEach, must be untouched
        expect(await service.getEntityEntitlements(requestData, EntitlementScope.DATASETS, 'dataset-1')).toEqual({
          everyone: [Capability.DOWNLOAD],
          'user1@example.com': [Capability.OBFUSCATE_AS_POINTS, Capability.PREVIEW, Capability.DOWNLOAD],
          'user3@example.com': [Capability.OBFUSCATE_AS_POINTS],
        });
      });

      // `dataset-1` is renamed to `dataset-1-renamed` in the top-level beforeEach, so both
      // strings sit in slug_history under one entity_id. Two config items keyed with those two
      // strings are still two unrelated config items: config ids are opaque and never rename,
      // and the dataset's history must not make either one an alias of the other.
      describe('when a config key collides with an entity slug history', () => {
        beforeEach(async () => {
          await entityManager.query(`
            INSERT INTO entitlements (id, data) VALUES
            ('config-user9@example.com', '{"configs": {"dataset-1-renamed": ["download"]}}')
          `);
        });

        it('does not return the grants of the config key matching the other slug', async () => {
          const entitlements = await service.getEntityEntitlements(requestData, EntitlementScope.CONFIGS, 'dataset-1');
          expect(entitlements).toEqual({});
        });

        it('does not strip the grants of the config key matching the other slug on write', async () => {
          await service.setEntityEntitlements(requestData, EntitlementScope.CONFIGS, 'dataset-1', {
            'config-user1@example.com': [Capability.READ],
          });

          expect(await service.getEntityEntitlements(requestData, EntitlementScope.CONFIGS, 'dataset-1-renamed')).toEqual({
            'config-user9@example.com': [Capability.DOWNLOAD],
          });
        });

        it('still expands the same pair of slugs in the datasets scope', async () => {
          const entitlements = await service.getEntityEntitlements(requestData, EntitlementScope.DATASETS, 'dataset-1-renamed');
          expect(entitlements).toEqual({
            everyone: [Capability.DOWNLOAD],
            'user1@example.com': [Capability.OBFUSCATE_AS_POINTS, Capability.PREVIEW, Capability.DOWNLOAD],
            'user3@example.com': [Capability.OBFUSCATE_AS_POINTS],
          });
        });
      });
    });
  });

  describe('callEntitlementsEndpoint', () => {
    const originalEndpoint = process.env.ENTITLEMENTS_ENDPOINT;
    let fetchSpy: jest.SpiedFunction<typeof fetch>;

    beforeEach(() => {
      process.env.ENTITLEMENTS_ENDPOINT = 'http://mock-entitlements';
      fetchSpy = jest.spyOn(global, 'fetch');
    });

    afterEach(() => {
      process.env.ENTITLEMENTS_ENDPOINT = originalEndpoint;
      fetchSpy.mockRestore();
    });

    // Agreed contract: an array of {slug: capabilities} entries, one per grant — not one flat
    // object. This is what the real external provider replies with. The external contract is
    // scope-agnostic, so the adapted map is wrapped under "datasets" (see ADR-0032).
    it('adapts the array-of-entries reply into a flat entitlements map, wrapped under "datasets"', async () => {
      const remoteReply = [{ 'dataset-1': [Capability.DOWNLOAD] }, { 'dataset-2': [Capability.PREVIEW] }];
      fetchSpy.mockResolvedValue({ ok: true, json: async () => remoteReply } as Response);

      const entitlements = await service.callEntitlementsEndpoint(requestData);
      expect(entitlements).toEqual({
        datasets: { 'dataset-1': [Capability.DOWNLOAD], 'dataset-2': [Capability.PREVIEW] },
        configs: {},
      });
    });

    it('treats a "__proto__" entry key from the external reply as an ordinary grant, not prototype hijacking', async () => {
      // JSON.parse of raw response text (not a JS object literal, which special-cases a literal
      // `__proto__:` key as setting the object's own prototype rather than creating an own
      // property) — this is what response.json() actually produces for an untrusted HTTP reply.
      const remoteReply = JSON.parse('[{"__proto__": ["read"]}, {"dataset-1": ["download"]}]');
      fetchSpy.mockResolvedValue({ ok: true, json: async () => remoteReply } as Response);

      const entitlements = await service.callEntitlementsEndpoint(requestData);

      expect(entitlements).toEqual({
        datasets: { ['__proto__']: [Capability.READ], 'dataset-1': [Capability.DOWNLOAD] },
        configs: {},
      });
      expect(Object.getPrototypeOf(entitlements.datasets)).toBeNull();
    });

    it('degrades to local entitlements (empty object) when the endpoint responds with an error status', async () => {
      fetchSpy.mockResolvedValue({ ok: false, status: 503, text: async () => 'service unavailable' } as Response);

      const entitlements = await service.callEntitlementsEndpoint(requestData);
      expect(entitlements).toEqual({ datasets: {}, configs: {} });
    });

    it('degrades to local entitlements (empty object) when the fetch itself fails', async () => {
      fetchSpy.mockRejectedValue(new Error('network error'));

      const entitlements = await service.callEntitlementsEndpoint(requestData);
      expect(entitlements).toEqual({ datasets: {}, configs: {} });
    });

    describe('when the reply does not match the agreed array-of-entries shape', () => {
      let errorSpy: jest.SpiedFunction<typeof log.error>;

      beforeEach(() => {
        errorSpy = jest.spyOn(log, 'error').mockImplementation(() => undefined);
      });

      afterEach(() => {
        errorSpy.mockRestore();
      });

      it.each([
        ['a flat object instead of an array', { 'dataset-1': [Capability.DOWNLOAD] }],
        ['an array with a non-object entry', ['dataset-1']],
        ['an array with an entry whose value is not an array', [{ 'dataset-1': Capability.DOWNLOAD }]],
        ['a plain string', 'download'],
        ['null', null],
      ])('discards the reply and logs an error for %s', async (_description, malformedReply) => {
        fetchSpy.mockResolvedValue({ ok: true, json: async () => malformedReply } as Response);

        const entitlements = await service.callEntitlementsEndpoint(requestData);

        expect(entitlements).toEqual({ datasets: {}, configs: {} });
        expect(errorSpy).toHaveBeenCalledWith(
          'External entitlements endpoint replied in an unexpected shape, discarding its response',
          expect.any(Object),
        );
      });
    });
  });

  describe('canReadConfig', () => {
    const configKey = 'test-config-key';

    it('returns false for a non-privileged caller with no capability for the config', () => {
      expect(service.canReadConfig(requestData, configKey)).toBe(false);
    });

    it('returns true for a non-privileged caller holding READ for the config', () => {
      const rd = { ...requestData, entitlements: { datasets: {}, configs: { [configKey]: [Capability.READ] } } };
      expect(service.canReadConfig(rd, configKey)).toBe(true);
    });

    it('returns true for a non-privileged caller holding WRITE for the config', () => {
      const rd = { ...requestData, entitlements: { datasets: {}, configs: { [configKey]: [Capability.WRITE] } } };
      expect(service.canReadConfig(rd, configKey)).toBe(true);
    });

    it('returns false for a non-privileged caller holding an unrelated capability only', () => {
      const rd = { ...requestData, entitlements: { datasets: {}, configs: { [configKey]: [] } } };
      expect(service.canReadConfig(rd, configKey)).toBe(false);
    });

    it.each([
      { isInternalRequest: true, isDataAdmin: false, isSuperAdmin: false },
      { isInternalRequest: false, isDataAdmin: true, isSuperAdmin: false },
      { isInternalRequest: false, isDataAdmin: false, isSuperAdmin: true },
    ])('returns true for a privileged caller regardless of capability', additionalData => {
      const rd = { ...requestData, token: { ...mockToken, ...additionalData }, entitlements: {} };
      expect(service.canReadConfig(rd, configKey)).toBe(true);
    });
  });

  describe('assertCanReadConfigEntitlement', () => {
    const configKey = 'test-config-key';

    it('rejects a non-privileged caller with no capability for the config', async () => {
      await expect(service.assertCanReadConfigEntitlement(requestData, configKey)).rejects.toMatchObject({ status: 403 });
    });

    it('allows a non-privileged caller holding READ for the config', async () => {
      const rd = { ...requestData, entitlements: { datasets: {}, configs: { [configKey]: [Capability.READ] } } };
      await expect(service.assertCanReadConfigEntitlement(rd, configKey)).resolves.toBeUndefined();
    });

    it('allows a non-privileged caller holding WRITE for the config', async () => {
      const rd = { ...requestData, entitlements: { datasets: {}, configs: { [configKey]: [Capability.WRITE] } } };
      await expect(service.assertCanReadConfigEntitlement(rd, configKey)).resolves.toBeUndefined();
    });

    it('rejects a non-privileged caller holding an unrelated capability only', async () => {
      const rd = { ...requestData, entitlements: { datasets: {}, configs: { [configKey]: [] } } };
      await expect(service.assertCanReadConfigEntitlement(rd, configKey)).rejects.toMatchObject({ status: 403 });
    });

    it.each([
      { isInternalRequest: true, isDataAdmin: false, isSuperAdmin: false },
      { isInternalRequest: false, isDataAdmin: true, isSuperAdmin: false },
      { isInternalRequest: false, isDataAdmin: false, isSuperAdmin: true },
    ])('allows a privileged caller regardless of capability', async additionalData => {
      const rd = { ...requestData, token: { ...mockToken, ...additionalData }, entitlements: {} };
      await expect(service.assertCanReadConfigEntitlement(rd, configKey)).resolves.toBeUndefined();
    });
  });

  describe('getConfigEntitlement', () => {
    const configKey = 'test-config-key';

    beforeEach(async () => {
      // The top-level `beforeEach` already seeds an 'everyone' row (under `datasets`) — merge
      // `configs` into it here rather than inserting a fresh row, which would collide on the
      // primary key.
      await entityManager.query(`
        UPDATE entitlements SET data = data || jsonb_build_object('configs', jsonb_build_object('${configKey}', '["read"]'::jsonb))
        WHERE id = '${EVERYONE}'
      `);
      await entityManager.query(`
        INSERT INTO entitlements (id, data) VALUES
        ('reader@example.com', jsonb_build_object('configs', jsonb_build_object('${configKey}', '["read"]'::jsonb))),
        ('writer@example.com', jsonb_build_object('configs', jsonb_build_object('${configKey}', '["write"]'::jsonb)))
      `);
    });

    it('gives a caller holding only READ their own entry and the EVERYONE entry, not other subjects', async () => {
      const rd = {
        ...requestData,
        token: { ...mockToken, sub: 'reader-id', email: 'reader@example.com' },
        entitlements: { datasets: {}, configs: { [configKey]: [Capability.READ] } },
      };

      await expect(service.getConfigEntitlement(rd, configKey)).resolves.toEqual({
        [EVERYONE]: [Capability.READ],
        'reader@example.com': [Capability.READ],
      });
    });

    it('gives a caller holding WRITE the full grant list, including other subjects', async () => {
      const rd = {
        ...requestData,
        token: { ...mockToken, sub: 'writer-id', email: 'writer@example.com' },
        entitlements: { datasets: {}, configs: { [configKey]: [Capability.WRITE] } },
      };

      await expect(service.getConfigEntitlement(rd, configKey)).resolves.toEqual({
        [EVERYONE]: [Capability.READ],
        'reader@example.com': [Capability.READ],
        'writer@example.com': [Capability.WRITE],
      });
    });

    it('gives a privileged caller the full grant list regardless of their own capability', async () => {
      const rd = { ...requestData, token: { ...mockToken, isSuperAdmin: true }, entitlements: {} };

      await expect(service.getConfigEntitlement(rd, configKey)).resolves.toEqual({
        [EVERYONE]: [Capability.READ],
        'reader@example.com': [Capability.READ],
        'writer@example.com': [Capability.WRITE],
      });
    });

    it('gives a caller covered only by EVERYONE just their EVERYONE-derived entry, not other subjects', async () => {
      const rd = {
        ...requestData,
        token: { ...mockToken, sub: 'bystander-id', email: 'bystander@example.com' },
        entitlements: { datasets: {}, configs: { [configKey]: [Capability.READ] } },
      };

      await expect(service.getConfigEntitlement(rd, configKey)).resolves.toEqual({ [EVERYONE]: [Capability.READ] });
    });
  });

  describe('canWriteConfig', () => {
    const configKey = 'test-config-key';

    it('returns false for a non-privileged caller with no existing WRITE grant, even for a fresh plugin: id', () => {
      expect(service.canWriteConfig(requestData, 'plugin:my-plugin:settings')).toBe(false);
    });

    it('returns true for a non-privileged caller holding an existing WRITE grant', () => {
      const rd = { ...requestData, entitlements: { datasets: {}, configs: { [configKey]: [Capability.WRITE] } } };
      expect(service.canWriteConfig(rd, configKey)).toBe(true);
    });

    it('returns false for a non-privileged caller holding READ only', () => {
      const rd = { ...requestData, entitlements: { datasets: {}, configs: { [configKey]: [Capability.READ] } } };
      expect(service.canWriteConfig(rd, configKey)).toBe(false);
    });

    it.each([
      { isInternalRequest: true, isDataAdmin: false, isSuperAdmin: false },
      { isInternalRequest: false, isDataAdmin: true, isSuperAdmin: false },
      { isInternalRequest: false, isDataAdmin: false, isSuperAdmin: true },
    ])('returns true for a privileged caller regardless of existing grants', additionalData => {
      const rd = { ...requestData, token: { ...mockToken, ...additionalData }, entitlements: {} };
      expect(service.canWriteConfig(rd, configKey)).toBe(true);
    });
  });

  describe('assertCanWriteConfigEntitlement', () => {
    const configKey = 'test-config-key';

    it('rejects a non-privileged caller with no existing WRITE grant, even for a fresh plugin: id (no more self-service first access)', async () => {
      await expect(service.assertCanWriteConfigEntitlement(requestData, 'plugin:my-plugin:settings')).rejects.toMatchObject({
        status: 403,
      });
    });

    it('allows a non-privileged caller holding an existing WRITE grant on a plugin: id', async () => {
      const rd = { ...requestData, entitlements: { datasets: {}, configs: { 'plugin:my-plugin:settings': [Capability.WRITE] } } };
      await expect(service.assertCanWriteConfigEntitlement(rd, 'plugin:my-plugin:settings')).resolves.toBeUndefined();
    });

    it('rejects a non-privileged caller with no grant on a non-plugin config id, even with no row yet', async () => {
      await expect(service.assertCanWriteConfigEntitlement(requestData, configKey)).rejects.toMatchObject({
        status: 403,
      });
    });

    it('rejects a non-privileged caller without WRITE once the config already has any grant', async () => {
      await entityManager.query(`
        INSERT INTO entitlements (id, data) VALUES ('config-other@example.com', '{"configs": {"${configKey}": ["read"]}}')
      `);

      await expect(service.assertCanWriteConfigEntitlement(requestData, configKey)).rejects.toMatchObject({
        status: 403,
      });
    });

    it('allows a caller holding WRITE for the config even though other grants already exist', async () => {
      await entityManager.query(`
        INSERT INTO entitlements (id, data) VALUES ('config-other@example.com', '{"configs": {"${configKey}": ["read"]}}')
      `);
      const rd = { ...requestData, entitlements: { datasets: {}, configs: { [configKey]: [Capability.WRITE] } } };

      await expect(service.assertCanWriteConfigEntitlement(rd, configKey)).resolves.toBeUndefined();
    });

    it('rejects a non-privileged caller on an existing config with no grants yet', async () => {
      await entityManager.getRepository('JsonStorage').save({ id: configKey, data: { some: 'value' } });

      await expect(service.assertCanWriteConfigEntitlement(requestData, configKey)).rejects.toMatchObject({
        status: 403,
      });
    });

    it('allows a privileged caller on an existing config with no grants yet', async () => {
      await entityManager.getRepository('JsonStorage').save({ id: configKey, data: { some: 'value' } });
      const rd = { ...requestData, token: { ...mockToken, isSuperAdmin: true } };

      await expect(service.assertCanWriteConfigEntitlement(rd, configKey)).resolves.toBeUndefined();
    });

    it('rejects a non-privileged caller on a plugin config id whose value was soft-deleted, even with no grant', async () => {
      const pluginConfigKey = 'plugin:acme:widget';
      const jsonStorageRepo = entityManager.getRepository('JsonStorage');
      await jsonStorageRepo.save({ id: pluginConfigKey, data: { some: 'value' } });
      await jsonStorageRepo.softDelete({ id: pluginConfigKey });

      await expect(service.assertCanWriteConfigEntitlement(requestData, pluginConfigKey)).rejects.toMatchObject({ status: 403 });
    });

    it.each([
      { isInternalRequest: true, isDataAdmin: false, isSuperAdmin: false },
      { isInternalRequest: false, isDataAdmin: true, isSuperAdmin: false },
      { isInternalRequest: false, isDataAdmin: false, isSuperAdmin: true },
    ])('allows a privileged caller regardless of existing grants', async additionalData => {
      await entityManager.query(`
        INSERT INTO entitlements (id, data) VALUES ('config-other@example.com', '{"configs": {"${configKey}": ["read"]}}')
      `);
      const rd = { ...requestData, token: { ...mockToken, ...additionalData }, entitlements: {} };

      await expect(service.assertCanWriteConfigEntitlement(rd, configKey)).resolves.toBeUndefined();
    });
  });

  describe('grantSelfConfigWrite', () => {
    const configKey = 'plugin:my-plugin:settings';
    let callerSubject: string;
    beforeEach(() => {
      callerSubject = getSubject(requestData);
    });

    it("grants WRITE to the caller's own subject for the key", async () => {
      await service.grantSelfConfigWrite(requestData, configKey);

      expect(await service.getEntityEntitlements(requestData, EntitlementScope.CONFIGS, configKey)).toEqual({
        [callerSubject]: [Capability.WRITE],
      });
    });

    it('is idempotent: calling it twice for the same subject/key merges instead of duplicating', async () => {
      await service.grantSelfConfigWrite(requestData, configKey);
      await service.grantSelfConfigWrite(requestData, configKey);

      expect(await service.getEntityEntitlements(requestData, EntitlementScope.CONFIGS, configKey)).toEqual({
        [callerSubject]: [Capability.WRITE],
      });
    });

    it("preserves the caller's existing grants on other keys", async () => {
      await entityManager.query(`
        INSERT INTO entitlements (id, data) VALUES ('${callerSubject}', '{"configs": {"other-key": ["read"]}}')
      `);

      await service.grantSelfConfigWrite(requestData, configKey);

      expect(await service.getEntityEntitlements(requestData, EntitlementScope.CONFIGS, 'other-key')).toEqual({
        [callerSubject]: [Capability.READ],
      });
      expect(await service.getEntityEntitlements(requestData, EntitlementScope.CONFIGS, configKey)).toEqual({
        [callerSubject]: [Capability.WRITE],
      });
    });

    // Reproduces a real race: the same subject winning first access on several distinct fresh
    // plugin: ids concurrently (e.g. several PUT /config/plugin:{pluginId}:{id} requests in
    // flight at once). Each request is its own transaction/connection, all targeting the same
    // EntitlementsEntity row (keyed by subject) but different keys within its `configs` object —
    // a non-atomic read-modify-write (findOneBy + save) loses all but the last writer's key.
    it('does not lose grants when the same subject wins first access on several distinct keys concurrently', async () => {
      const keys = Array.from({ length: 8 }, (_, i) => `plugin:acme:item-${i}`);

      await Promise.all(keys.map(key => service.grantSelfConfigWrite(requestData, key)));

      const [row] = await entityManager.query(`SELECT data->'configs' AS configs FROM entitlements WHERE id = $1`, [callerSubject]);
      expect(row.configs).toEqual(Object.fromEntries(keys.map(key => [key, [Capability.WRITE]])));
    });
  });

  describe('setConfigEntitlement', () => {
    const configKey = 'plugin:my-plugin:settings';

    it('writes the entitlements when the caller already holds WRITE for the config', async () => {
      const rd = { ...requestData, entitlements: { datasets: {}, configs: { [configKey]: [Capability.WRITE] } } };
      const payload = { 'new-user@example.com': [Capability.READ] };

      const result = await service.setConfigEntitlement(rd, configKey, payload);

      expect(result).toEqual(payload);
      expect(await service.getEntityEntitlements(requestData, EntitlementScope.CONFIGS, configKey)).toEqual(payload);
    });

    it('rejects and does not write for a non-privileged caller with no existing WRITE grant (no more self-service first access)', async () => {
      const payload = { [getSubject(requestData)]: [Capability.WRITE] };

      await expect(service.setConfigEntitlement(requestData, configKey, payload)).rejects.toMatchObject({ status: 403 });
      expect(await service.getEntityEntitlements(requestData, EntitlementScope.CONFIGS, configKey)).toEqual({});
    });

    it('rejects and does not write when the write gate fails', async () => {
      const existingGrants = { 'config-other@example.com': [Capability.READ] };
      await entityManager.query(`
        INSERT INTO entitlements (id, data) VALUES ('config-other@example.com', '{"configs": {"${configKey}": ["read"]}}')
      `);

      await expect(
        service.setConfigEntitlement(requestData, configKey, { 'new-user@example.com': [Capability.READ] }),
      ).rejects.toMatchObject({ status: 403 });
      expect(await service.getEntityEntitlements(requestData, EntitlementScope.CONFIGS, configKey)).toEqual(existingGrants);
    });
  });

  describe('selectByScope', () => {
    it('returns the configs entries under a subkey prefix, excluding unrelated keys', () => {
      const entitlements = {
        datasets: {},
        configs: { dashboards_1: [Capability.READ], dashboards_2: [Capability.READ], look_and_feel: [Capability.READ] },
      };
      expect(service.selectByScope(entitlements, ConfigSubkeyScope.DASHBOARDS)).toEqual({
        dashboards_1: [Capability.READ],
        dashboards_2: [Capability.READ],
      });
    });

    it('matches a singleton subkey entry with no suffix, via exact equality', () => {
      const entitlements = { datasets: {}, configs: { dashboards: [Capability.READ] } };
      expect(service.selectByScope(entitlements, ConfigSubkeyScope.DASHBOARDS)).toEqual({ dashboards: [Capability.READ] });
    });

    it('matches a plugin-owned key on its id part, keeping the full key (with prefix) in the result', () => {
      const entitlements = {
        datasets: {},
        configs: {
          'plugin:weather-widget:dashboards_1': [Capability.READ],
          'plugin:weather-widget:dashboards': [Capability.READ],
          'plugin:weather-widget:look_and_feel': [Capability.READ],
          dashboards_2: [Capability.READ],
        },
      };
      expect(service.selectByScope(entitlements, ConfigSubkeyScope.DASHBOARDS)).toEqual({
        'plugin:weather-widget:dashboards_1': [Capability.READ],
        'plugin:weather-widget:dashboards': [Capability.READ],
        dashboards_2: [Capability.READ],
      });
    });
  });

  describe('enforceEntitlements', () => {
    beforeEach(async () => {
      // Make dataset-1 public, dataset-2 and dataset-3 remain private (default)
      await entityManager.getRepository(DatasetEntity).update({ slug: 'dataset-1' }, { visibility: 'public' });
    });

    it('should not throw when all requested slugs do not exist', async () => {
      await expect(
        service.enforceEntitlements(requestData, EntitlementScope.DATASETS, ['non-existent'], Capability.DOWNLOAD),
      ).resolves.toBeUndefined();
    });

    it('should not throw when all matching datasets are public', async () => {
      await expect(
        service.enforceEntitlements(requestData, EntitlementScope.DATASETS, ['dataset-1'], Capability.DOWNLOAD),
      ).resolves.toBeUndefined();
    });

    it('should not throw for a mix of public and private when user has capability for private ones', async () => {
      const rd = { ...requestData, entitlements: { datasets: { 'dataset-2': [Capability.DOWNLOAD] }, configs: {} } };
      await expect(
        service.enforceEntitlements(rd, EntitlementScope.DATASETS, ['dataset-1', 'dataset-2'], Capability.DOWNLOAD),
      ).resolves.toBeUndefined();
    });

    it('should not throw when user has the required capability for a private dataset', async () => {
      const rd = { ...requestData, entitlements: { datasets: { 'dataset-2': [Capability.PREVIEW] }, configs: {} } };
      await expect(service.enforceEntitlements(rd, EntitlementScope.DATASETS, ['dataset-2'], Capability.PREVIEW)).resolves.toBeUndefined();
    });

    it('should throw 403 when user has no entitlements for a private dataset', async () => {
      await expect(
        service.enforceEntitlements(requestData, EntitlementScope.DATASETS, ['dataset-2'], Capability.DOWNLOAD),
      ).rejects.toMatchObject({
        status: 403,
      });
    });

    it('should throw 403 when user has entitlements for a private dataset but not the required capability', async () => {
      const rd = { ...requestData, entitlements: { datasets: { 'dataset-2': [Capability.PREVIEW] }, configs: {} } };
      await expect(service.enforceEntitlements(rd, EntitlementScope.DATASETS, ['dataset-2'], Capability.DOWNLOAD)).rejects.toMatchObject({
        status: 403,
      });
    });

    it('should throw 403 on the first private dataset the user lacks access to', async () => {
      const rd = { ...requestData, entitlements: { datasets: { 'dataset-2': [Capability.DOWNLOAD] }, configs: {} } };
      await expect(
        service.enforceEntitlements(rd, EntitlementScope.DATASETS, ['dataset-2', 'dataset-3'], Capability.DOWNLOAD),
      ).rejects.toMatchObject({
        status: 403,
      });
    });

    it.each([
      { isInternalRequest: true, isDataAdmin: false, isSuperAdmin: false },
      { isInternalRequest: false, isDataAdmin: true, isSuperAdmin: false },
      { isInternalRequest: false, isDataAdmin: false, isSuperAdmin: true },
    ])('should not throw for internal requests or admins', async additionalData => {
      const rd = { ...requestData, token: { ...mockToken, ...additionalData }, entitlements: {} };
      await expect(
        service.enforceEntitlements(rd, EntitlementScope.DATASETS, ['dataset-2', 'dataset-3'], Capability.DOWNLOAD),
      ).resolves.toBeUndefined();
    });

    describe('configs scope', () => {
      it('has no public bypass: throws 403 even though no entity is "public"', async () => {
        await expect(
          service.enforceEntitlements(requestData, EntitlementScope.CONFIGS, ['dashboard_1'], Capability.READ),
        ).rejects.toMatchObject({
          status: 403,
        });
      });

      it('does not throw when the user has the required capability for the config key', async () => {
        const rd = { ...requestData, entitlements: { datasets: {}, configs: { dashboard_1: [Capability.READ] } } };
        await expect(service.enforceEntitlements(rd, EntitlementScope.CONFIGS, ['dashboard_1'], Capability.READ)).resolves.toBeUndefined();
      });

      describe('slug-history collision', () => {
        // Prerequisites:
        // - "dataset-1" fixture is renamed to "dataset-1-renamed" in the top-level beforeEach,
        // - entitlements are under the historical slug.
        // The tests verifies that the configs scope is not affected by that rename,
        // even though the two slugs happen to collide with two config keys.
        beforeEach(async () => {
          await entityManager.query(`
            INSERT INTO entitlements (id, data) VALUES
            ('config-user9@example.com', '{"configs": {"dataset-1-renamed": ["download"]}}')
          `);
        });

        it('does not return another config item grants', async () => {
          const grants = await service.getEntityEntitlements(requestData, EntitlementScope.CONFIGS, 'dataset-1');
          // Nobody holds a grant on config `dataset-1`.
          expect(grants).toEqual({});
        });

        it('does not wipe another config item grants on write', async () => {
          await service.setEntityEntitlements(requestData, EntitlementScope.CONFIGS, 'dataset-1', {
            'config-user1@example.com': [Capability.READ],
          });

          // Asserted against the raw row on purpose: reading back through
          // getEntityEntitlements('dataset-1-renamed') expands the same way and would
          // mask the wipe by surfacing the grant just written under 'dataset-1'.
          const [row] = await entityManager.query(
            `SELECT data->'configs' AS configs FROM entitlements WHERE id = 'config-user9@example.com'`,
          );
          expect(row.configs).toEqual({ 'dataset-1-renamed': ['download'] });
        });
      });
    });
  });
});
