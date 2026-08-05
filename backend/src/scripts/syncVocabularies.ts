import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { EntityManager } from 'typeorm';
import { getDataSource } from '../utils/data-source';
import { log } from '../utils/logger';

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
 */

const DATA_MODEL_DIR = path.join(__dirname, '../../docs/data-model');

interface SyncResult {
  inserted: number;
  updated: number;
  orphaned: string[];
}

function readCsv<T>(fileName: string): T[] {
  const raw = fs.readFileSync(path.join(DATA_MODEL_DIR, fileName), 'utf8');
  return parse(raw, { columns: true, skip_empty_lines: true, trim: true }) as T[];
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
async function syncLicenses(manager: EntityManager, dryRun: boolean = false): Promise<SyncResult> {
  const rows = readCsv<LicenseRow>('6-license_options.csv');
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

  return { inserted, updated, orphaned };
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
  warning_message: string;
}

/**
 * property_id is resolved from soil_properties.property_acronym = CSV.subproperty_code — the same
 * join the original seed SQL used. A row whose property doesn't exist yet is skipped and warned
 * about rather than failing the whole sync: soil_properties has its own CSV (out of scope here),
 * so this can legitimately run before that vocabulary is fully populated.
 */
async function syncUnitConversions(manager: EntityManager, dryRun: boolean = false): Promise<SyncResult> {
  const rows = readCsv<ConversionRow>('5b-conversion-rules-table.csv');
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
      if (row.warning_message?.trim()) metadata['warning_message'] = row.warning_message.trim();

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

  return { inserted, updated, orphaned };
}

export async function syncVocabularies(dryRun: boolean = false): Promise<void> {
  const dataSource = await getDataSource();
  const manager = dataSource.manager;
  const label = dryRun ? 'would sync' : 'synced';

  const licenses = await syncLicenses(manager, dryRun);
  log.info(`Licenses ${label}`, { ...licenses });
  if (licenses.orphaned.length > 0) {
    log.warn('Licenses in the DB but no longer in the CSV — left untouched', { names: licenses.orphaned });
  }

  const unitConversions = await syncUnitConversions(manager, dryRun);
  log.info(`Unit conversions ${label}`, { ...unitConversions });
  if (unitConversions.orphaned.length > 0) {
    log.warn('Unit conversions in the DB but no longer in the CSV — left untouched', { entries: unitConversions.orphaned });
  }
}
