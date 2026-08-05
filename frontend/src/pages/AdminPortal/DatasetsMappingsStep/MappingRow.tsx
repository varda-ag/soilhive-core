import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import classnames from 'classnames';
import { AutocompleteDropdown } from 'components/AutocompleteDropdown/AutocompleteDropdown';
import { Dropdown } from 'components/UI';
import ArrowDownIcon from 'assets/icons/dropdown-arrow-down-icon.svg?react';
import CheckIconCircle from 'assets/icons/check-icon-circle.svg?react';
import WarningIcon from 'assets/icons/small-warning-icon.svg?react';
import type { MenuOption } from 'components/UI/types';
import styles from './MappingRow.module.scss';

interface Props {
  columnName: string;
  isMapped: boolean;
  conceptOptions: MenuOption[];
  unitOptions: MenuOption[];
  conceptValue: string | null;
  unitValue: string | null;
  isExpanded: boolean;
  isUnitEnabled: boolean;
  isDetailsEnabled: boolean;
  isGeometryDetectedField: boolean;
  onToggle: (columnName: string) => void;
  onConceptChange: (columnName: string, value: string) => void;
  onUnitChange: (columnName: string, value: string) => void;
  // Raster's depth inputs; omitted for the default variant.
  extraCell?: ReactNode;
  // The variant-specific *RowDetails panel, rendered by the caller when isExpanded && isDetailsEnabled.
  detailsContent?: ReactNode;
}

export function MappingRow({
  columnName,
  isMapped,
  conceptOptions,
  unitOptions,
  conceptValue,
  unitValue,
  isExpanded,
  isUnitEnabled,
  isDetailsEnabled,
  isGeometryDetectedField,
  onToggle,
  onConceptChange,
  onUnitChange,
  extraCell,
  detailsContent,
}: Props) {
  const { t } = useTranslation('admin');

  return (
    <div className={styles.MappingRow} data-testid="sh-mapping-row">
      <div className={classnames(styles.RowMain, { [styles.RowMainWithExtra]: !!extraCell })}>
        <button
          className={classnames(styles.Chevron, {
            [styles.ChevronExpanded]: isExpanded,
            [styles.ChevronHidden]: !isDetailsEnabled,
          })}
          onClick={() => onToggle(columnName)}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? t('datasets.mappings.row.collapse_row') : t('datasets.mappings.row.expand_row')}
          tabIndex={isDetailsEnabled ? 0 : -1}
        >
          <ArrowDownIcon className={styles.ChevronIcon} />
        </button>

        <div className={styles.StatusIcon}>
          {isMapped ? <CheckIconCircle className={styles.CheckIcon} /> : <WarningIcon className={styles.WarningIcon} />}
        </div>

        <div className={styles.ColumnName} title={columnName}>
          {columnName}
        </div>

        <div className={styles.ConceptCell}>
          <AutocompleteDropdown
            size="small"
            options={conceptOptions}
            value={conceptValue ?? undefined}
            placeholder={t('datasets.mappings.row.select_concept')}
            onChange={code => onConceptChange(columnName, code)}
            onClear={isGeometryDetectedField ? undefined : () => onConceptChange(columnName, '')}
            isDisabled={isGeometryDetectedField}
          />
        </div>

        <div className={styles.UnitCell}>
          <Dropdown
            size="small"
            options={unitOptions}
            value={unitValue ?? undefined}
            placeholder={t('datasets.mappings.row.unit_placeholder')}
            isDisabled={!isUnitEnabled}
            onChange={value => onUnitChange(columnName, value as string)}
          />
        </div>

        {extraCell}
      </div>

      {isExpanded && isDetailsEnabled && detailsContent}
    </div>
  );
}
