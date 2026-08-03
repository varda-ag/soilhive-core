import { useTranslation } from 'react-i18next';
import { RasterMappingRow } from './RasterMappingRow';
import { METADATA_FIELD_CODES } from 'hooks/useRasterMappingStep';
import type { ColumnMapping, DetailOptionMap, RowDetails } from 'hooks/useRasterMappingStep';
import type { MenuOption } from 'types/components';
import styles from './RasterMappingsTable.module.scss';

interface Props {
  columnMappings: ColumnMapping[];
  conceptOptionsByColumn: Record<string, MenuOption[]>;
  unitOptionsByConcept: Record<string, MenuOption[]>;
  detailOptions: DetailOptionMap;
  expandedRows: Set<string>;
  onToggleRow: (columnName: string) => void;
  onConceptChange: (columnName: string, value: string) => void;
  onUnitChange: (columnName: string, value: string) => void;
  onMinDepthChange: (columnName: string, value: string) => void;
  onMaxDepthChange: (columnName: string, value: string) => void;
  onDetailChange: (columnName: string, field: keyof RowDetails, value: string) => void;
  onReferencePeriodStartChange: (columnName: string, value: string) => void;
  onReferencePeriodStopChange: (columnName: string, value: string) => void;
  onLayerDescriptionChange: (columnName: string, value: string) => void;
}

export function RasterMappingsTable({
  columnMappings,
  conceptOptionsByColumn,
  unitOptionsByConcept,
  detailOptions,
  expandedRows,
  onToggleRow,
  onConceptChange,
  onUnitChange,
  onMinDepthChange,
  onMaxDepthChange,
  onDetailChange,
  onReferencePeriodStartChange,
  onReferencePeriodStopChange,
  onLayerDescriptionChange,
}: Props) {
  const { t } = useTranslation('admin');
  return (
    <div className={styles.RasterMappingsTable} data-testid="sh-raster-mappings-table">
      <div className={styles.Header}>
        <div className={styles.HeaderSpacer} />
        <span className={styles.HeaderCell}>{t('datasets.mappings.table.detected_layers')}</span>
        <span className={styles.HeaderCell}>{t('datasets.mappings.table.map_to')}</span>
        <span className={styles.HeaderCell}>{t('datasets.mappings.table.original_unit')}</span>
        <span className={styles.HeaderCell}>{t('datasets.mappings.table.min_max_depth')}</span>
      </div>
      <div className={styles.Rows}>
        {columnMappings.map(mapping => {
          const unitOptions = mapping.conceptId ? (unitOptionsByConcept[mapping.conceptId] ?? []) : [];
          const isDetailsEnabled = mapping.conceptId !== null && !METADATA_FIELD_CODES.has(mapping.conceptId);
          return (
            <RasterMappingRow
              key={mapping.columnName}
              mapping={mapping}
              conceptOptions={conceptOptionsByColumn[mapping.columnName] ?? []}
              unitOptions={unitOptions}
              detailOptions={detailOptions}
              isExpanded={expandedRows.has(mapping.columnName)}
              isUnitEnabled={mapping.conceptId !== null && unitOptions.length > 0}
              isDetailsEnabled={isDetailsEnabled}
              onToggle={onToggleRow}
              onConceptChange={onConceptChange}
              onUnitChange={onUnitChange}
              onMinDepthChange={onMinDepthChange}
              onMaxDepthChange={onMaxDepthChange}
              onDetailChange={onDetailChange}
              onReferencePeriodStartChange={onReferencePeriodStartChange}
              onReferencePeriodStopChange={onReferencePeriodStopChange}
              onLayerDescriptionChange={onLayerDescriptionChange}
              isGeometryDetectedField={mapping.isGeometryDetectedField}
            />
          );
        })}
      </div>
    </div>
  );
}
