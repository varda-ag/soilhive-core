import { useTranslation } from 'react-i18next';
import { MappingRow } from './MappingRow';
import { METADATA_FIELD_CODES } from 'hooks/useMappingsStep';
import type { ColumnMapping, DetailOptionMap, RowDetails } from 'hooks/useMappingsStep';
import type { MenuOption } from 'types/components';
import styles from './MappingsTable.module.scss';

interface Props {
  columnMappings: ColumnMapping[];
  conceptOptionsByColumn: Record<string, MenuOption[]>;
  unitOptionsByConcept: Record<string, MenuOption[]>;
  detailOptions: DetailOptionMap;
  expandedRows: Set<string>;
  onToggleRow: (columnName: string) => void;
  onConceptChange: (columnName: string, value: string) => void;
  onUnitChange: (columnName: string, value: string) => void;
  onDetailChange: (columnName: string, field: keyof RowDetails, value: string) => void;
}

export function MappingsTable({
  columnMappings,
  conceptOptionsByColumn,
  unitOptionsByConcept,
  detailOptions,
  expandedRows,
  onToggleRow,
  onConceptChange,
  onUnitChange,
  onDetailChange,
}: Props) {
  const { t } = useTranslation('admin');

  return (
    <div className={styles.MappingsTable} data-testid="sh-mappings-table">
      <div className={styles.Header}>
        <div className={styles.HeaderSpacer} />
        <span className={styles.HeaderCell}>{t('datasets.mappings.table.detected_columns')}</span>
        <span className={styles.HeaderCell}>{t('datasets.mappings.table.map_to')}</span>
        <span className={styles.HeaderCell}>{t('datasets.mappings.table.original_unit')}</span>
      </div>

      <div className={styles.Rows}>
        {columnMappings.map(mapping => {
          const unitOptions = mapping.conceptId ? (unitOptionsByConcept[mapping.conceptId] ?? []) : [];
          // Details panel only applies to soil properties, not structural fields
          const isDetailsEnabled = mapping.conceptId !== null && !METADATA_FIELD_CODES.has(mapping.conceptId);
          return (
            <MappingRow
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
              onDetailChange={onDetailChange}
              isGeometryDetectedField={mapping.isGeometryDetectedField}
            />
          );
        })}
      </div>
    </div>
  );
}
