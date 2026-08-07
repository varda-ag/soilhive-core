import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { syncVocabularies } from '../../src/scripts/syncVocabularies';
import { getDataSource } from '../../src/utils/data-source';
import { addCategory, addLicense, addSoilProperty, addUnitConversion } from '../../src/utils/mock';
import LicenseEntity from '../../src/entities/License';
import SoilPropertyEntity from '../../src/entities/SoilProperty';
import UnitConversionEntity from '../../src/entities/UnitConversion';
import { JsonStorage } from '../../src/entities/JsonStorage';

/**
 * These exercise data-safety guarantees against a database that already has real rows, not just
 * whether a fresh sync populates correctly — orphan preservation, id/slug stability, and resilience
 * to a partial failure or a concurrent run are the properties that matter once this runs against a
 * real environment rather than a fixture-only test DB.
 */

const DEFAULT_CSVS: Record<string, string> = {
  '6-license_options.csv': 'License,Description,Documentation\n',
  '4f-soil-property-category-table.csv': 'category_name,category_acronym,description\nChemical,chem,Chemical properties\n',
  '4c-soil-property-vocabulary-table.csv': 'Property,property_Code,subproperty,subproperty_code,standard_unit,Classification,Description\n',
  '4e-analytical-methodology-table.csv':
    'sample_pretreatment,laboratory_method,extractant_concentration,extraction_ratio,extraction_base,measurement_procedure,limit_of_detection\n',
  '5b-conversion-rules-table.csv':
    'property_name,subproperty_code,original_unit,original_unit_QUDT_URI,standard_unit_QUDT_URI,conversion_type,formula,notes\n',
};

const tempDirs: string[] = [];

/** Writes all five CSVs (defaults, unless overridden) to a scratch dir and points the sync at it. */
const useVocabDataDir = (overrides: Partial<Record<string, string>> = {}): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-sync-'));
  for (const [fileName, defaultContent] of Object.entries(DEFAULT_CSVS)) {
    fs.writeFileSync(path.join(dir, fileName), overrides[fileName] ?? defaultContent);
  }
  process.env['VOCAB_DATA_MODEL_DIR'] = dir;
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  delete process.env['VOCAB_DATA_MODEL_DIR'];
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('syncVocabularies - data safety', () => {
  it('leaves a row untouched, byte-for-byte, when it is no longer in the CSV', async () => {
    const license = await addLicense('Pre-existing License');
    const category = await addCategory('Existing Category');
    const property = await addSoilProperty('Pre-existing Property', category.id);

    useVocabDataDir(); // every CSV is header-only — nothing in it matches these rows

    await syncVocabularies();

    const dataSource = await getDataSource();
    const reloadedLicense = await dataSource.getRepository(LicenseEntity).findOneByOrFail({ id: license.id });
    const reloadedProperty = await dataSource.getRepository(SoilPropertyEntity).findOneByOrFail({ id: property.id });

    expect(reloadedLicense).toEqual(license);
    expect(reloadedProperty).toEqual(property);
  });

  it('leaves an FK-referenced row and its referencing rows intact when the property drops out of the CSV', async () => {
    const category = await addCategory('Existing Category');
    const property = await addSoilProperty('Referenced Property', category.id);
    const conversion = await addUnitConversion(property.id, 'test_unit');

    useVocabDataDir(); // the property this conversion depends on is not in any CSV

    await syncVocabularies();

    const dataSource = await getDataSource();
    const reloadedProperty = await dataSource.getRepository(SoilPropertyEntity).findOneByOrFail({ id: property.id });
    const reloadedConversion = await dataSource.getRepository(UnitConversionEntity).findOneByOrFail({ id: conversion.id });

    expect(reloadedProperty).toEqual(property);
    expect(reloadedConversion).toEqual(conversion);
    expect(reloadedConversion.property_id).toBe(property.id);
  });

  it('keeps id and slug stable when a non-identity field changes on a real re-sync', async () => {
    useVocabDataDir({
      '6-license_options.csv': 'License,Description,Documentation\nStable License — Full Name,desc,https://example.com/v1\n',
    });
    await syncVocabularies();

    const dataSource = await getDataSource();
    const repo = dataSource.getRepository(LicenseEntity);
    const first = await repo.findOneByOrFail({ name: 'Stable License' });

    // Same name (the natural key), different url — a genuine content change, not a no-op.
    useVocabDataDir({
      '6-license_options.csv': 'License,Description,Documentation\nStable License — Full Name,desc,https://example.com/v2\n',
    });
    await syncVocabularies();

    const second = await repo.findOneByOrFail({ name: 'Stable License' });
    expect(second.id).toBe(first.id);
    expect(second.slug).toBe(first.slug);
    expect(second.url).toBe('https://example.com/v2');
  });

  it('produces no duplicates when two syncs race against the same database', async () => {
    useVocabDataDir({
      '6-license_options.csv':
        'License,Description,Documentation\n' +
        'Race License A,desc,https://example.com/a\n' +
        'Race License B,desc,https://example.com/b\n' +
        'Race License C,desc,https://example.com/c\n',
    });

    await expect(Promise.all([syncVocabularies(), syncVocabularies()])).resolves.toBeDefined();

    const dataSource = await getDataSource();
    const licenses = await dataSource.getRepository(LicenseEntity).find();
    expect(licenses).toHaveLength(3);
    expect(new Set(licenses.map(l => l.name)).size).toBe(3);
  });

  it('persists the hash of each table that succeeded even when a later table fails', async () => {
    useVocabDataDir({
      '6-license_options.csv': 'License,Description,Documentation\nSurvives Partial Failure,desc,https://example.com\n',
      // Malformed: an unterminated quoted field makes csv-parse throw synchronously, simulating a
      // hard failure partway through the pipeline (licenses and categories already ran by then).
      '4c-soil-property-vocabulary-table.csv': 'Property,property_Code\n"unterminated',
    });

    await expect(syncVocabularies()).rejects.toThrow();

    const dataSource = await getDataSource();
    const licenses = await dataSource.getRepository(LicenseEntity).find();
    expect(licenses.map(l => l.name)).toContain('Survives Partial Failure');

    const hashRow = await dataSource.getRepository(JsonStorage).findOneByOrFail({ id: 'vocabulary-csv-hashes' });
    const hashes = hashRow.data as Record<string, string>;
    expect(hashes['licenses']).toBeDefined();
    expect(hashes['soil_property_categories']).toBeDefined();
    // soil_properties never completed, and unit_conversions never even started.
    expect(hashes['soil_properties']).toBeUndefined();
    expect(hashes['unit_converisons']).toBeUndefined();
  });
});
