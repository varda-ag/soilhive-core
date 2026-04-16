import { useTranslation } from 'react-i18next';
import classnames from 'classnames';
import { AutocompleteDropdown, Dropdown } from 'components/UI';
import ArrowDownIcon from 'assets/icons/dropdown-arrow-down-icon.svg?react';
import CheckIconCircle from 'assets/icons/check-icon-circle.svg?react';
import WarningIcon from 'assets/icons/warning-icon.svg?react';
import { MappingRowDetails } from './MappingRowDetails';
import type { ColumnMapping, DetailOptionMap, RowDetails } from 'hooks/useMappingsStep';
import type { MenuOption } from 'types/components';
import styles from './MappingRow.module.scss';

interface Props {
  mapping: ColumnMapping;
  conceptOptions: MenuOption[];
  unitOptions: MenuOption[];
  detailOptions: DetailOptionMap;
  isExpanded: boolean;
  isUnitEnabled: boolean;
  onToggle: (columnName: string) => void;
  onConceptChange: (columnName: string, value: string) => void;
  onUnitChange: (columnName: string, value: string) => void;
  onDetailChange: (columnName: string, field: keyof RowDetails, value: string) => void;
}

export function MappingRow({
  mapping,
  conceptOptions,
  unitOptions,
  detailOptions,
  isExpanded,
  isUnitEnabled,
  onToggle,
  onConceptChange,
  onUnitChange,
  onDetailChange,
}: Props) {
  const { t } = useTranslation('admin');
  const isMapped = mapping.conceptId !== null;

  return (
    <div className={styles.MappingRow} data-testid="sh-mapping-row">
      <div className={styles.RowMain}>
        <button
          className={classnames(styles.Chevron, { [styles.ChevronExpanded]: isExpanded })}
          onClick={() => onToggle(mapping.columnName)}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
        >
          <ArrowDownIcon className={styles.ChevronIcon} />
        </button>

        <div className={styles.StatusIcon}>
          {isMapped ? <CheckIconCircle className={styles.CheckIcon} /> : <WarningIcon className={styles.WarningIcon} />}
        </div>

        <div className={styles.ColumnName}>{mapping.columnName}</div>

        <div className={styles.ConceptCell}>
          <AutocompleteDropdown
            size="small"
            options={conceptOptions}
            value={mapping.conceptId ?? undefined}
            placeholder={t('datasets.mappings.row.select_concept')}
            onChange={code => onConceptChange(mapping.columnName, code)}
          />
        </div>

        <div className={styles.UnitCell}>
          <Dropdown
            size="small"
            options={unitOptions}
            value={mapping.unitId ?? undefined}
            placeholder={t('datasets.mappings.row.unit_placeholder')}
            isDisabled={!isUnitEnabled}
            onChange={value => onUnitChange(mapping.columnName, value as string)}
          />
        </div>
      </div>

      {isExpanded && (
        <MappingRowDetails
          columnName={mapping.columnName}
          details={mapping.details}
          detailOptions={detailOptions}
          onDetailChange={onDetailChange}
        />
      )}
    </div>
  );
}
