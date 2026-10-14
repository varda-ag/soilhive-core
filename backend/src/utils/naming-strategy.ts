import { createHash } from 'node:crypto';
import { DefaultNamingStrategy, Table } from 'typeorm';

// PostgreSQL silently truncates identifiers to NAMEDATALEN - 1 bytes.
const MAX_IDENTIFIER_LENGTH = 63;
const HASH_LENGTH = 8;

// Names already deployed that differ from what the formulas produce: truncated by PostgreSQL or
// written by hand in migrations. Keyed by the formula's full name, so an entry stops applying once
// its constraint's table or columns change.
const LEGACY_NAMES = new Map<string, string>([
  ['PK_data_filter_user_geometries_data_filter_id_user_geometry_id', 'PK_data_filter_user_geometries'],
  ['PK_raster_layer_footprints_raster_layer_id_raster_footprint_id', 'PK_raster_layer_footprints'],
  ['PK_raster_layer_group_members_layer_group_id_raster_layer_id', 'PK_raster_layer_group_members'],
  ['UQ_dataset_layers_dataset_id_feature_id_layer_id_soil_property_id', 'UQ_dataset_layers_dataset_id_feature_id_layer_id_soil_property_'],
  [
    'UQ_procedures_sample_pretreatment_id_technique_laboratory_method_id_extractant_concentration_id_extraction_ratio_id_extraction_base_id_measurement_procedure_id_limit_of_detection_id',
    'UQ_procedures_sample_pretreatment_id_technique_laboratory_metho',
  ],
  ['FK_data_filter_user_geometries_data_filter_id_data_filters_id', 'FK_dfug_data_filter_id'],
  ['FK_data_filter_user_geometries_user_geometry_id_user_geometries_id', 'FK_dfug_user_geometry_id'],
  [
    'FK_datasets_id_slug_history_entity_id_datasets_slug_slug_history_slug',
    'FK_datasets_id_id_slug_slug_slug_history_slug_entity_id_slug_en',
  ],
  ['FK_feature_dai_stats_feature_id_features_id', 'FK_feature_dai_stats_feature_id'],
  ['FK_files_id_slug_history_entity_id_files_slug_slug_history_slug', 'FK_files_id_id_slug_slug_slug_history_entity_id_slug_slug_entit'],
  [
    'FK_licenses_id_slug_history_entity_id_licenses_slug_slug_history_slug',
    'FK_licenses_id_id_slug_slug_slug_history_entity_id_slug_entity_',
  ],
  [
    'FK_procedures_extractant_concentration_id_vocabulary_id_procedures_extractant_concentration_category_vocabulary_category',
    'FK_procedures_extractant_concentration_id_extractant_concentrat',
  ],
  [
    'FK_procedures_extraction_base_id_vocabulary_id_procedures_extraction_base_category_vocabulary_category',
    'FK_procedures_extraction_base_id_extraction_base_category_vocab',
  ],
  [
    'FK_procedures_extraction_ratio_id_vocabulary_id_procedures_extraction_ratio_category_vocabulary_category',
    'FK_procedures_extraction_ratio_id_extraction_ratio_category_voc',
  ],
  [
    'FK_procedures_id_slug_history_entity_id_procedures_slug_slug_history_slug',
    'FK_procedures_id_id_slug_slug_slug_history_entity_id_slug_slug_',
  ],
  [
    'FK_procedures_laboratory_method_id_vocabulary_id_procedures_laboratory_method_category_vocabulary_category',
    'FK_procedures_laboratory_method_id_laboratory_method_category_v',
  ],
  [
    'FK_procedures_limit_of_detection_id_vocabulary_id_procedures_limit_of_detection_category_vocabulary_category',
    'FK_procedures_limit_of_detection_id_limit_of_detection_category',
  ],
  [
    'FK_procedures_measurement_procedure_id_vocabulary_id_procedures_measurement_procedure_category_vocabulary_category',
    'FK_procedures_measurement_procedure_id_smeasurement_procedure_c',
  ],
  [
    'FK_procedures_sample_pretreatment_id_vocabulary_id_procedures_sample_pretreatment_category_vocabulary_category',
    'FK_procedures_sample_pretreatment_id_sample_pretreatment_catego',
  ],
  ['FK_raster_layer_footprints_raster_footprint_id_raster_footprints_id', 'FK_raster_layer_footprints_raster_footprint_id'],
  ['FK_raster_layer_footprints_raster_layer_id_raster_layers_id', 'FK_raster_layer_footprints_raster_layer_id'],
  ['FK_raster_layer_group_members_layer_group_id_raster_layer_groups_id', 'FK_raster_layer_group_members_layer_group_id'],
  ['FK_raster_layer_group_members_raster_layer_id_raster_layers_id', 'FK_raster_layer_group_members_raster_layer_id'],
  [
    'FK_soil_properties_id_slug_history_entity_id_soil_properties_slug_slug_history_slug',
    'FK_soil_properties_id_id_slug_slug_slug_history_slug_entity_id_',
  ],
  [
    'FK_soil_property_categories_id_slug_history_entity_id_soil_property_categories_slug_slug_history_slug',
    'FK_soil_property_categories_id_id_slug_slug_slug_history_entity',
  ],
  [
    'FK_unit_conversions_id_slug_history_entity_id_unit_conversions_slug_slug_history_slug',
    'FK_unit_conversions_id_id_slug_slug_slug_history_entity_id_slug',
  ],
  ['FK_user_geometry_subdivisions_user_geometry_id_user_geometries_id', 'FK_ugs_user_geometry_id'],
  ['IDX_dataset_layers_dataset_id', 'idx_dataset_layers_dataset'],
  ['IDX_dataset_layers_feature_id', 'idx_dataset_layers_feature'],
]);

/**
 * Names that fit are kept as they are. Longer ones keep a readable prefix and end with a hash of
 * the full name, so two names sharing their first 63 characters can't collide.
 */
export const fitIdentifier = (name: string): string => {
  const legacy = LEGACY_NAMES.get(name);
  if (legacy) return legacy;
  if (name.length <= MAX_IDENTIFIER_LENGTH) return name;

  const hash = createHash('sha256').update(name).digest('hex').slice(0, HASH_LENGTH);
  const prefix = name.slice(0, MAX_IDENTIFIER_LENGTH - HASH_LENGTH - 1).replace(/_+$/, '');
  return `${prefix}_${hash}`;
};

export class DatabaseNamingStrategy extends DefaultNamingStrategy {
  override primaryKeyName(tableOrName: Table | string, columnNames: string[]): string {
    return fitIdentifier(`PK_${this.getTableName(tableOrName)}_${this.joinColumns(columnNames)}`);
  }

  private joinColumns(columnNames: string[]): string {
    return columnNames.join('_');
  }

  override uniqueConstraintName(tableOrName: Table | string, columnNames: string[]): string {
    return fitIdentifier(`UQ_${this.getTableName(tableOrName)}_${this.joinColumns(columnNames)}`);
  }

  override foreignKeyName(
    referencingTableOrName: Table | string,
    referencingColumnNames: string[],
    referencedTablePath?: string,
    referencedColumnNames?: string[],
  ): string {
    const referencingTableName = this.getTableName(referencingTableOrName);

    const referencingReferencedGroup = referencingColumnNames.map((referencingColumn, index) => {
      return `${referencingTableName}_${referencingColumn}_${referencedTablePath}_${referencedColumnNames?.[index]}`;
    });

    return fitIdentifier(`FK_${referencingReferencedGroup.join('_')}`);
  }

  override indexName(tableOrName: Table | string, columnNames: string[], where?: string): string {
    let indexName = `IDX_${this.getTableName(tableOrName)}_${this.joinColumns(columnNames)}`;

    if (where) {
      const suffix = this.getPartialIndexNameSuffix(tableOrName, columnNames, where);
      indexName = `${indexName}_${suffix}`;
    }

    return fitIdentifier(indexName);
  }
  private getPartialIndexNameSuffix(tableOrName: Table | string, columnNames: string[], where: string): string {
    const whereClauseMap: Record<string, string> = {
      '"deleted_at" IS NULL': `deleted_at_IS_NULL`,
    };

    if (whereClauseMap[where]) {
      return `WHERE_${whereClauseMap[where]}`;
    }

    const generatedIndexName = super.indexName(tableOrName, columnNames, where);
    const { 1: hash } = generatedIndexName.split('IDX_');

    return `WHERE_${hash}`;
  }
}
