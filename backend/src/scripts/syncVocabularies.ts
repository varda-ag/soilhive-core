import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { parse } from 'csv-parse/sync';
import { EntityManager } from 'typeorm';
import { getDataSource } from '../utils/data-source';
import { log } from '../utils/logger';
import { JsonStorage } from '../entities/JsonStorage';
import ConfigService from '../services/ConfigService';
import { VocabularyType } from '../types/data';

/**
 * Syncs vocabulary tables from the CSVs in backend/docs/data-model/. They live under backend/
 * rather than the repo-root docs/ so the Docker image (built with backend/ as its context) can
 * include them; the narrative docs in docs/data-model/ link out to them by relative path.
 *
 * Called automatically on every boot (app.ts) — the CSVs only change via a new image, so a deploy
 * is the only thing that makes this data stale, the same way the automatic refreshDaiStats hooks
 * fire whenever their underlying data changes. Also exposed as --sync-vocabularies (utils/cli.ts)
 * for an on-demand re-run without a redeploy.
 *
 * Upserts by natural key so ids/slugs of existing rows never change (both are referenced by FK
 * from datasets/observations, and slugs feed slug_history). A row that exists in the DB but is no
 * longer present in the CSV is never deleted automatically — it's only logged as an orphan, since
 * removal is a decision a human should make deliberately, not an accident of a stale/incomplete
 * CSV export.
 *
 * Each file is skipped entirely — no per-row queries at all, not even the orphan check — when its
 * content hash matches the one stored from the last successful sync (jsonstorage, keyed
 * CSV_HASHES_CONFIG_ID), since most boots run against the exact same image as the one before. A
 * dry run makes the same skip decision as a real run (so it previews truthfully) but never
 * persists the new hash, matching its no-writes contract.
 */

const DEFAULT_DATA_MODEL_DIR = path.join(__dirname, '../../docs/data-model');
const CSV_HASHES_CONFIG_ID = 'vocabulary-csv-hashes';
const LICENSES_CSV = '6-license_options.csv';
const CATEGORIES_CSV = '4f-soil-property-category-table.csv';
const SOIL_PROPERTIES_CSV = '4c-soil-property-vocabulary-table.csv';
const PROCEDURES_CSV = '4e-analytical-methodology-table.csv';
const UNIT_CONVERSIONS_CSV = '5b-conversion-rules-table.csv';

interface SyncResult {
  inserted: number;
  updated: number;
  orphaned: string[];
  skipped: boolean;
}

interface FileSyncResult extends SyncResult {
  hash: string;
}

// Read live rather than cached at module load, same as LOCAL_STORAGE_ROOT_FOLDER elsewhere — lets
// tests point this at a scratch directory of controlled fixtures instead of the real CSVs.
function dataModelDir(): string {
  return process.env['VOCAB_DATA_MODEL_DIR'] ? path.resolve(process.env['VOCAB_DATA_MODEL_DIR']) : DEFAULT_DATA_MODEL_DIR;
}

function readRawCsv(fileName: string): string {
  return fs.readFileSync(path.join(dataModelDir(), fileName), 'utf8');
}

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function parseCsv<T>(raw: string): T[] {
  return parse(raw, { columns: true, skip_empty_lines: true, trim: true }) as T[];
}

interface csvHashes {
  licenses?: string;
  soil_property_categories?: string;
  soil_properties?: string;
  unit_converisons?: string;
  analytical_methodologies?: string;
}

interface LicenseRow {
  License: string;
  Description: string;
  Documentation: string;
}

/**
 * name/full_name are split from the CSV's "<name> — <full name>" column. full_name is only ever
 * set on first insert: several existing rows carry a more precise official name than the CSV's own
 * text (e.g. "Attribution 3.0 Unported" vs. the CSV's "Attribution"), so a sync must never
 * overwrite it on an already-existing row.
 */
async function syncLicenses(manager: EntityManager, dryRun: boolean, storedHash: string | undefined): Promise<FileSyncResult> {
  const raw = readRawCsv(LICENSES_CSV);
  const hash = hashContent(raw);
  if (hash === storedHash) {
    return { inserted: 0, updated: 0, orphaned: [], skipped: true, hash };
  }

  const rows = parseCsv<LicenseRow>(raw);
  const names = new Set<string>();
  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    const dashIndex = row.License.indexOf('—');
    const name = (dashIndex === -1 ? row.License : row.License.slice(0, dashIndex)).trim();
    const fullName = dashIndex === -1 ? null : row.License.slice(dashIndex + 1).trim();
    const url = row.Documentation?.trim() || null;
    if (!name) continue;
    names.add(name);

    try {
      if (dryRun) {
        // Read-only classification: does this name already exist? No write happens either way.
        const [existingRow] = await manager.query(`SELECT 1 FROM licenses WHERE name = $1`, [name]);
        if (existingRow) updated++;
        else inserted++;
        continue;
      }
      const [result] = await manager.query(
        `INSERT INTO licenses (name, full_name, url) VALUES ($1, $2, $3)
         ON CONFLICT (name) DO UPDATE SET url = EXCLUDED.url
         RETURNING (xmax = 0) AS inserted`,
        [name, fullName, url],
      );
      if (result?.inserted) inserted++;
      else updated++;
    } catch (error) {
      log.error('Failed to sync license', { name, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const existing: { name: string }[] = await manager.query(`SELECT name FROM licenses`);
  const orphaned = existing.map(r => r.name).filter(name => !names.has(name));

  return { inserted, updated, orphaned, skipped: false, hash };
}

interface CategoryRow {
  category_name: string;
  category_acronym: string;
  description?: string;
}

async function syncCategories(manager: EntityManager, dryRun: boolean, storedHash: string | undefined): Promise<FileSyncResult> {
  const raw = readRawCsv(CATEGORIES_CSV);
  const hash = hashContent(raw);
  if (hash === storedHash) {
    return { inserted: 0, updated: 0, orphaned: [], skipped: true, hash };
  }

  const rows = parseCsv<CategoryRow>(raw);
  const names = new Set<string>();
  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    const categoryName = row.category_name.trim();
    const categoryAcronym = row.category_acronym.trim();
    const description = row.description?.trim() || null;
    if (!categoryName) continue;
    names.add(categoryName);

    try {
      if (dryRun) {
        // Read-only classification: does this name already exist? No write happens either way.
        const [existingRow] = await manager.query(`SELECT 1 FROM soil_property_categories WHERE category_name = $1`, [categoryName]);
        if (existingRow) updated++;
        else inserted++;
        continue;
      }
      const [result] = await manager.query(
        `INSERT INTO soil_property_categories (category_name, category_acronym, description) VALUES ($1, $2, $3)
         ON CONFLICT (category_name) DO UPDATE SET category_acronym = EXCLUDED.category_acronym, description = EXCLUDED.description
         RETURNING (xmax = 0) AS inserted`,
        [categoryName, categoryAcronym, description],
      );
      if (result?.inserted) inserted++;
      else updated++;
    } catch (error) {
      log.error('Failed to sync soil property category', { categoryName, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const existing: { category_name: string }[] = await manager.query(`SELECT category_name FROM soil_property_categories`);
  const orphaned = existing.map(r => r.category_name).filter(name => !names.has(name));

  return { inserted, updated, orphaned, skipped: false, hash };
}

interface SoilPropertyRow {
  Property: string;
  property_Code: string;
  subproperty?: string;
  subproperty_code?: string;
  standard_unit?: string;
  Classification: string;
  Description: string;
}

/**
 * Each CSV row carries a level-1 Property and, when it has a subproperty, a level-2 child that
 * narrows it — "Acid Saturation" (level 1) appears on every row that names one of its subproperties
 * ("Acid Saturation total", "Hydrogen Saturation", ...), so the parent is upserted once per row it
 * appears on (idempotent, if redundant) and only the child row carries this row's own
 * description/standard_unit — the parent's own values, if any, come from wherever they were first
 * set, not from whichever sibling row happened to sync last.
 *
 * category_id is resolved from soil_property_categories.category_name = CSV.Classification. A row
 * naming a category that isn't there yet is skipped and warned about, the same way
 * syncUnitConversions treats a missing property.
 */
async function syncSoilProperties(manager: EntityManager, dryRun: boolean, storedHash: string | undefined): Promise<FileSyncResult> {
  const raw = readRawCsv(SOIL_PROPERTIES_CSV);
  const hash = hashContent(raw);
  if (hash === storedHash) {
    return { inserted: 0, updated: 0, orphaned: [], skipped: true, hash };
  }

  const rows = parseCsv<SoilPropertyRow>(raw);
  const names = new Set<string>();
  const missingCategories = new Set<string>();
  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    const propertyName = row.Property?.trim();
    const propertyAcronym = row.property_Code?.trim();
    if (!propertyName || !propertyAcronym) continue;

    const subpropertyName = row.subproperty?.trim();
    const subpropertyCode = row.subproperty_code?.trim();
    if (Boolean(subpropertyName) !== Boolean(subpropertyCode)) {
      log.warn('Soil property sync: row has only one of subproperty/subproperty_code — skipped', {
        property: propertyName,
        subproperty: row.subproperty,
        subproperty_code: row.subproperty_code,
      });
      continue;
    }
    const hasSubproperty = Boolean(subpropertyName) && Boolean(subpropertyCode);

    const category = row.Classification?.trim();
    if (!category) continue;
    const [categoryRow] = await manager.query(`SELECT id FROM soil_property_categories WHERE category_name = $1`, [category]);
    if (!categoryRow) {
      missingCategories.add(category);
      continue;
    }
    const categoryId = categoryRow.id;

    const description = row.Description?.trim() || null;
    const standardUnit = row.standard_unit?.trim() || null;

    try {
      if (dryRun) {
        // Read-only classification: does the parent (and, if present, the child) already exist?
        // No write happens either way.
        const [existingParent] = await manager.query(`SELECT 1 FROM soil_properties WHERE property_name = $1`, [propertyName]);
        if (existingParent) updated++;
        else inserted++;
        names.add(propertyName);

        if (hasSubproperty) {
          const [existingChild] = await manager.query(`SELECT 1 FROM soil_properties WHERE property_name = $1`, [subpropertyName]);
          if (existingChild) updated++;
          else inserted++;
          names.add(subpropertyName!);
        }
        continue;
      }

      if (!hasSubproperty) {
        const [result] = await manager.query(
          `INSERT INTO soil_properties (property_name, property_acronym, description, standard_unit, property_level, category_id)
           VALUES ($1, $2, $3, $4, 1, $5)
           ON CONFLICT (property_name) DO UPDATE SET
             property_acronym = EXCLUDED.property_acronym,
             description = EXCLUDED.description,
             standard_unit = EXCLUDED.standard_unit,
             property_level = EXCLUDED.property_level,
             category_id = EXCLUDED.category_id
           RETURNING (xmax = 0) AS inserted`,
          [propertyName, propertyAcronym, description, standardUnit, categoryId],
        );
        if (result?.inserted) inserted++;
        else updated++;
        names.add(propertyName);
      } else {
        // Parent excludes description/standard_unit deliberately: those columns describe this
        // row's subproperty, not the parent grouping it repeats alongside on every sibling row.
        const [parentResult] = await manager.query(
          `INSERT INTO soil_properties (property_name, property_acronym, property_level, category_id)
           VALUES ($1, $2, 1, $3)
           ON CONFLICT (property_name) DO UPDATE SET
             property_acronym = EXCLUDED.property_acronym,
             property_level = EXCLUDED.property_level,
             category_id = EXCLUDED.category_id
           RETURNING id, (xmax = 0) AS inserted`,
          [propertyName, propertyAcronym, categoryId],
        );
        if (parentResult?.inserted) inserted++;
        else updated++;
        names.add(propertyName);

        const [childResult] = await manager.query(
          `INSERT INTO soil_properties (property_name, property_acronym, description, standard_unit, property_level, category_id, parent_property_id)
           VALUES ($1, $2, $3, $4, 2, $5, $6)
           ON CONFLICT (property_name) DO UPDATE SET
             property_acronym = EXCLUDED.property_acronym,
             description = EXCLUDED.description,
             standard_unit = EXCLUDED.standard_unit,
             property_level = EXCLUDED.property_level,
             category_id = EXCLUDED.category_id,
             parent_property_id = EXCLUDED.parent_property_id
           RETURNING (xmax = 0) AS inserted`,
          [subpropertyName, subpropertyCode, description, standardUnit, categoryId, parentResult.id],
        );
        if (childResult?.inserted) inserted++;
        else updated++;
        names.add(subpropertyName!);
      }
    } catch (error) {
      log.error('Failed to sync soil property', {
        property: propertyName,
        subproperty: subpropertyName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (missingCategories.size > 0) {
    log.warn('Soil property sync: no soil_property_categories row for these classifications', { categories: [...missingCategories] });
  }

  const existing: { property_name: string }[] = await manager.query(`SELECT property_name FROM soil_properties`);
  const orphaned = existing.map(r => r.property_name).filter(name => !names.has(name));

  return { inserted, updated, orphaned, skipped: false, hash };
}

interface ProcedureRow {
  sample_pretreatment?: string;
  laboratory_method?: string;
  extractant_concentration?: string;
  extraction_ratio?: string;
  extraction_base?: string;
  measurement_procedure?: string;
  limit_of_detection?: string;
}

// One column of the CSV per VocabularyType category — the header names match the enum values
// exactly, so this is the whole mapping.
const PROCEDURE_COLUMN_CATEGORIES: Record<keyof ProcedureRow, VocabularyType> = {
  sample_pretreatment: VocabularyType.SAMPLE_PRETREATMENT,
  laboratory_method: VocabularyType.LABORATORY_METHOD,
  extractant_concentration: VocabularyType.EXTRACTANT_CONCENTRATION,
  extraction_ratio: VocabularyType.EXTRACTION_RATIO,
  extraction_base: VocabularyType.EXTRACTION_BASE,
  measurement_procedure: VocabularyType.MEASUREMENT_PROCEDURE,
  limit_of_detection: VocabularyType.LIMIT_OF_DETECTION,
};

/**
 * Each CSV column is its own vocabulary category (VocabularyType); each cell under it is one term
 * of that category. A term is deduplicated across the whole file — the same value (e.g. a common
 * sample pretreatment) legitimately repeats across many analytical-methodology rows, but is one
 * vocabulary row, not one per row it appears on.
 *
 * Upserts by (category, name) — see 1785800000000-UnitConversionSlugTriggerColumns.ts, which added
 * the unique index this relies on. Nothing else on VocabularyEntity to update on conflict, so the
 * DO UPDATE is a same-value no-op purely to get a RETURNING row for the insert/update count.
 */
async function syncProcedures(manager: EntityManager, dryRun: boolean, storedHash: string | undefined): Promise<FileSyncResult> {
  const raw = readRawCsv(PROCEDURES_CSV);
  const hash = hashContent(raw);
  if (hash === storedHash) {
    return { inserted: 0, updated: 0, orphaned: [], skipped: true, hash };
  }

  const rows = parseCsv<ProcedureRow>(raw);
  const seen = new Set<string>();
  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    for (const column of Object.keys(PROCEDURE_COLUMN_CATEGORIES) as (keyof ProcedureRow)[]) {
      const name = row[column]?.trim();
      if (!name) continue;
      const category = PROCEDURE_COLUMN_CATEGORIES[column];
      const key = `${category}::${name}`;
      if (seen.has(key)) continue;
      seen.add(key);

      try {
        if (dryRun) {
          // Read-only classification: does this (category, name) pair already exist? No write
          // happens either way.
          const [existingRow] = await manager.query(`SELECT 1 FROM vocabulary WHERE category = $1 AND name = $2`, [category, name]);
          if (existingRow) updated++;
          else inserted++;
          continue;
        }
        const [result] = await manager.query(
          `INSERT INTO vocabulary (category, name) VALUES ($1, $2)
           ON CONFLICT (category, name) WHERE "deleted_at" IS NULL DO UPDATE SET name = EXCLUDED.name
           RETURNING (xmax = 0) AS inserted`,
          [category, name],
        );
        if (result?.inserted) inserted++;
        else updated++;
      } catch (error) {
        log.error('Failed to sync vocabulary term', { category, name, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  const existing: { category: string; name: string }[] = await manager.query(`SELECT category, name FROM vocabulary`);
  const orphaned = existing.filter(row => !seen.has(`${row.category}::${row.name}`)).map(row => `${row.category} / ${row.name}`);

  return { inserted, updated, orphaned, skipped: false, hash };
}

interface ConversionRow {
  property_name: string;
  subproperty_code: string;
  original_unit: string;
  original_unit_QUDT_URI: string;
  standard_unit_QUDT_URI: string;
  conversion_type: string;
  formula: string;
  notes: string;
}

/**
 * property_id is resolved from soil_properties.property_acronym = CSV.subproperty_code — the same
 * join the original seed SQL used. A row whose property doesn't exist yet is skipped and warned
 * about rather than failing the whole sync: soil_properties has its own CSV (out of scope here),
 * so this can legitimately run before that vocabulary is fully populated.
 */
async function syncUnitConversions(manager: EntityManager, dryRun: boolean, storedHash: string | undefined): Promise<FileSyncResult> {
  const raw = readRawCsv(UNIT_CONVERSIONS_CSV);
  const hash = hashContent(raw);
  if (hash === storedHash) {
    return { inserted: 0, updated: 0, orphaned: [], skipped: true, hash };
  }

  const rows = parseCsv<ConversionRow>(raw);
  const seen = new Set<string>();
  const missingAcronyms = new Set<string>();
  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    const acronym = row.subproperty_code?.trim();
    const originalUnit = row.original_unit?.trim();
    if (!acronym || !originalUnit) continue;

    const [property] = await manager.query(`SELECT id FROM soil_properties WHERE property_acronym = $1`, [acronym]);
    if (!property) {
      missingAcronyms.add(acronym);
      continue;
    }
    seen.add(`${property.id}::${originalUnit}`);

    try {
      if (dryRun) {
        // Read-only classification: does this (property, unit) pair already exist? No write
        // happens either way.
        const [existingRow] = await manager.query(
          `SELECT 1 FROM unit_conversions WHERE property_id = $1 AND original_unit_of_measurement = $2`,
          [property.id, originalUnit],
        );
        if (existingRow) updated++;
        else inserted++;
        continue;
      }

      const metadata: Record<string, string> = {};
      if (row.original_unit_QUDT_URI?.trim()) metadata['original_unit_QUDT_URI'] = row.original_unit_QUDT_URI.trim();
      if (row.standard_unit_QUDT_URI?.trim()) metadata['standard_unit_QUDT_URI'] = row.standard_unit_QUDT_URI.trim();
      if (row.notes?.trim()) metadata['notes'] = row.notes.trim();

      const [result] = await manager.query(
        `INSERT INTO unit_conversions (property_id, original_unit_of_measurement, conversion_formula, type, metadata)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (property_id, original_unit_of_measurement)
         DO UPDATE SET conversion_formula = EXCLUDED.conversion_formula, type = EXCLUDED.type, metadata = EXCLUDED.metadata
         RETURNING (xmax = 0) AS inserted`,
        [property.id, originalUnit, row.formula?.trim() || null, row.conversion_type?.trim(), JSON.stringify(metadata)],
      );
      if (result?.inserted) inserted++;
      else updated++;
    } catch (error) {
      log.error('Failed to sync unit conversion', {
        acronym,
        originalUnit,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (missingAcronyms.size > 0) {
    log.warn('Unit conversion sync: no soil_properties row for these acronyms', { acronyms: [...missingAcronyms] });
  }

  const existing: { property_id: string; original_unit_of_measurement: string; property_acronym: string }[] = await manager.query(
    `SELECT uc.property_id, uc.original_unit_of_measurement, sp.property_acronym
     FROM unit_conversions uc JOIN soil_properties sp ON sp.id = uc.property_id`,
  );
  const orphaned = existing
    .filter(row => !seen.has(`${row.property_id}::${row.original_unit_of_measurement}`))
    .map(row => `${row.property_acronym} / ${row.original_unit_of_measurement}`);

  return { inserted, updated, orphaned, skipped: false, hash };
}

export async function syncVocabularies(dryRun: boolean = false): Promise<void> {
  const dataSource = await getDataSource();
  const manager = dataSource.manager;
  const label = dryRun ? 'would sync' : 'synced';
  const configService = new ConfigService();

  const hashRepo = manager.getRepository(JsonStorage);
  const storedHashesRow = await hashRepo.findOneBy({ id: CSV_HASHES_CONFIG_ID });
  const storedHashes = (storedHashesRow?.data as csvHashes | undefined) ?? {};
  // Persisted after each table rather than once at the end: if a later table throws, the tables
  // that already succeeded this run must not redo their work on the next one just because the
  // run as a whole didn't finish. Never runs in dry-run mode, per its no-writes contract.
  const currentHashes: csvHashes = { ...storedHashes };
  const persistHash = async (key: keyof csvHashes, hash: string): Promise<void> => {
    currentHashes[key] = hash;
    if (!dryRun) {
      await configService.putConfig(hashRepo, CSV_HASHES_CONFIG_ID, currentHashes);
    }
  };

  const licenses = await syncLicenses(manager, dryRun, storedHashes.licenses);
  if (licenses.skipped) {
    log.info('Licenses unchanged since last sync — skipped');
  } else {
    log.info(`Licenses ${label}`, { inserted: licenses.inserted, updated: licenses.updated });
    if (licenses.orphaned.length > 0) {
      log.warn('Licenses in the DB but no longer in the CSV — left untouched', { names: licenses.orphaned });
    }
    await persistHash('licenses', licenses.hash);
  }

  const categories = await syncCategories(manager, dryRun, storedHashes.soil_property_categories);
  if (categories.skipped) {
    log.info('Soil property categories unchanged since last sync — skipped');
  } else {
    log.info(`Soil property categories ${label}`, { inserted: categories.inserted, updated: categories.updated });
    if (categories.orphaned.length > 0) {
      log.warn('Soil property categories in the DB but no longer in the CSV — left untouched', { entries: categories.orphaned });
    }
    await persistHash('soil_property_categories', categories.hash);
  }

  // Must run after categories (looks up category_id) and before unit conversions (looks up
  // property_id) — both by natural key, so this is the only place the ordering is enforced.
  const soilProperties = await syncSoilProperties(manager, dryRun, storedHashes.soil_properties);
  if (soilProperties.skipped) {
    log.info('Soil properties unchanged since last sync — skipped');
  } else {
    log.info(`Soil properties ${label}`, { inserted: soilProperties.inserted, updated: soilProperties.updated });
    if (soilProperties.orphaned.length > 0) {
      log.warn('Soil properties in the DB but no longer in the CSV — left untouched', { entries: soilProperties.orphaned });
    }
    await persistHash('soil_properties', soilProperties.hash);
  }

  const procedureTerms = await syncProcedures(manager, dryRun, storedHashes.analytical_methodologies);
  if (procedureTerms.skipped) {
    log.info('Vocabulary terms unchanged since last sync — skipped');
  } else {
    log.info(`Vocabulary terms ${label}`, { inserted: procedureTerms.inserted, updated: procedureTerms.updated });
    if (procedureTerms.orphaned.length > 0) {
      log.warn('Vocabulary terms in the DB but no longer in the CSV — left untouched', { entries: procedureTerms.orphaned });
    }
    await persistHash('analytical_methodologies', procedureTerms.hash);
  }

  const unitConversions = await syncUnitConversions(manager, dryRun, storedHashes.unit_converisons);
  if (unitConversions.skipped) {
    log.info('Unit conversions unchanged since last sync — skipped');
  } else {
    log.info(`Unit conversions ${label}`, { inserted: unitConversions.inserted, updated: unitConversions.updated });
    if (unitConversions.orphaned.length > 0) {
      log.warn('Unit conversions in the DB but no longer in the CSV — left untouched', { entries: unitConversions.orphaned });
    }
    await persistHash('unit_converisons', unitConversions.hash);
  }
}
