import { useTranslation } from 'react-i18next';
import { MappingRow } from './MappingRow';
import type { ColumnMapping, DetailOptionMap, RowDetails } from 'hooks/useMappingsStep';
import type { MenuOption } from 'types/components';
import styles from './MappingsTable.module.scss';

interface Props {
  columnMappings: ColumnMapping[];
  conceptOptions: MenuOption[];
  unitOptions: MenuOption[];
  detailOptions: DetailOptionMap;
  expandedRows: Set<string>;
  isUnitEnabled: (columnName: string) => boolean;
  onToggleRow: (columnName: string) => void;
  onConceptChange: (columnName: string, value: string) => void;
  onUnitChange: (columnName: string, value: string) => void;
  onDetailChange: (columnName: string, field: keyof RowDetails, value: string) => void;
}

export function MappingsTable({
  columnMappings,
  conceptOptions,
  unitOptions,
  detailOptions,
  expandedRows,
  isUnitEnabled,
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
        {columnMappings.map(mapping => (
          <MappingRow
            key={mapping.columnName}
            mapping={mapping}
            conceptOptions={conceptOptions}
            unitOptions={unitOptions}
            detailOptions={detailOptions}
            isExpanded={expandedRows.has(mapping.columnName)}
            isUnitEnabled={isUnitEnabled(mapping.columnName)}
            onToggle={onToggleRow}
            onConceptChange={onConceptChange}
            onUnitChange={onUnitChange}
            onDetailChange={onDetailChange}
          />
        ))}
      </div>
    </div>
  );
}
