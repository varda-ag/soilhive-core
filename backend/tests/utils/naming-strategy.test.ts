import { describe, it, expect } from '@jest/globals';
import { DatabaseNamingStrategy, fitIdentifier } from '../../src/utils/naming-strategy';

describe('DatabaseNamingStrategy', () => {
  const strategy = new DatabaseNamingStrategy();
  const longColumns = ['first_rather_long_column_name', 'second_rather_long_column_name'];

  it('keeps names that fit unchanged', () => {
    expect(strategy.primaryKeyName('layers', ['id'])).toBe('PK_layers_id');
    expect(strategy.uniqueConstraintName('features', ['geom_hash'])).toBe('UQ_features_geom_hash');
    expect(strategy.foreignKeyName('layers', ['license'], 'licenses', ['id'])).toBe('FK_layers_license_licenses_id');
    expect(strategy.indexName('layers', ['sampling_date'])).toBe('IDX_layers_sampling_date');
    expect(strategy.indexName('vocabulary', ['id', 'category'], '"deleted_at" IS NULL')).toBe(
      'IDX_vocabulary_id_category_WHERE_deleted_at_IS_NULL',
    );
  });

  it('shortens long names to 63 characters, keeping a readable prefix', () => {
    const names = [
      strategy.primaryKeyName('some_table', longColumns),
      strategy.uniqueConstraintName('some_table', longColumns),
      strategy.foreignKeyName('some_table', longColumns, 'other_table', ['id', 'category']),
      strategy.indexName('some_table', longColumns),
      strategy.indexName('some_table', longColumns, '"status" IS NOT NULL'),
    ];

    for (const name of names) {
      expect(name.length).toBeLessThanOrEqual(63);
      expect(name).toMatch(/^(PK|UQ|FK|IDX)_some_table_.*_[0-9a-f]{8}$/);
    }
  });

  it('is deterministic', () => {
    expect(strategy.uniqueConstraintName('some_table', longColumns)).toBe(strategy.uniqueConstraintName('some_table', longColumns));
  });

  it('does not collide when long names share their first 63 characters', () => {
    const first = strategy.uniqueConstraintName('some_table', [...longColumns, 'third_a']);
    const second = strategy.uniqueConstraintName('some_table', [...longColumns, 'third_b']);

    expect(first.slice(0, 54)).toBe(second.slice(0, 54));
    expect(first).not.toBe(second);
  });

  it('returns the deployed name for constraints that predate the length limit', () => {
    expect(strategy.uniqueConstraintName('dataset_layers', ['dataset_id', 'feature_id', 'layer_id', 'soil_property_id'])).toBe(
      'UQ_dataset_layers_dataset_id_feature_id_layer_id_soil_property_',
    );
    expect(strategy.foreignKeyName('datasets', ['id', 'slug'], 'slug_history', ['entity_id', 'slug'])).toBe(
      'FK_datasets_id_id_slug_slug_slug_history_slug_entity_id_slug_en',
    );
    expect(strategy.indexName('dataset_layers', ['dataset_id'])).toBe('idx_dataset_layers_dataset');
  });

  it('never ends the prefix with a doubled underscore', () => {
    // 54 characters of prefix end exactly on the underscore before "x".
    const name = fitIdentifier(`${'a'.repeat(53)}_${'x'.repeat(20)}`);

    expect(name).toMatch(/^a{53}_[0-9a-f]{8}$/);
  });
});
