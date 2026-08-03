import { useTranslation } from 'react-i18next';
import classnames from 'classnames';
import { AutocompleteDropdown } from 'components/AutocompleteDropdown/AutocompleteDropdown';
import { Dropdown, TextInput } from 'components/UI';
import ArrowDownIcon from 'assets/icons/dropdown-arrow-down-icon.svg?react';
import CheckIconCircle from 'assets/icons/check-icon-circle.svg?react';
import WarningIcon from 'assets/icons/small-warning-icon.svg?react';
import { RasterMappingRowDetails } from './RasterMappingRowDetails';
import type { ColumnMapping, DetailOptionMap, RowDetails } from 'hooks/useRasterMappingStep';
import type { MenuOption } from 'types/components';
import styles from './RasterMappingRow.module.scss';

interface Props {
  mapping: ColumnMapping;
  conceptOptions: MenuOption[];
  unitOptions: MenuOption[];
  detailOptions: DetailOptionMap;
  isExpanded: boolean;
  isUnitEnabled: boolean;
  isDetailsEnabled: boolean;
  isGeometryDetectedField: boolean;
  onToggle: (columnName: string) => void;
  onConceptChange: (columnName: string, value: string) => void;
  onUnitChange: (columnName: string, value: string) => void;
  onMinDepthChange: (columnName: string, value: string) => void;
  onMaxDepthChange: (columnName: string, value: string) => void;
  onDetailChange: (columnName: string, field: keyof RowDetails, value: string) => void;
  onReferencePeriodStartChange: (columnName: string, value: string) => void;
  onReferencePeriodStopChange: (columnName: string, value: string) => void;
  onLayerDescriptionChange: (columnName: string, value: string) => void;
}

export function RasterMappingRow({
  mapping,
  conceptOptions,
  unitOptions,
  detailOptions,
  isExpanded,
  isUnitEnabled,
  isDetailsEnabled,
  isGeometryDetectedField,
  onToggle,
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
  const isMapped = mapping.conceptId !== null;

  return (
    <div className={styles.MappingRow} data-testid="sh-mapping-row">
      <div className={styles.RowMain}>
        <button
          className={classnames(styles.Chevron, {
            [styles.ChevronExpanded]: isExpanded,
            [styles.ChevronHidden]: !isDetailsEnabled,
          })}
          onClick={() => onToggle(mapping.columnName)}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
          tabIndex={isDetailsEnabled ? 0 : -1}
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
            onClear={isGeometryDetectedField ? undefined : () => onConceptChange(mapping.columnName, '')}
            isDisabled={isGeometryDetectedField}
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

        <div className={styles.DepthCell}>
          <TextInput
            className={styles.DepthInput}
            size="small"
            type="number"
            placeholder={t('datasets.mappings.row.depth_from_placeholder')}
            value={mapping.minDepth ?? ''}
            onChange={value => onMinDepthChange(mapping.columnName, value)}
          />
          <TextInput
            className={styles.DepthInput}
            size="small"
            type="number"
            placeholder={t('datasets.mappings.row.depth_to_placeholder')}
            value={mapping.maxDepth ?? ''}
            onChange={value => onMaxDepthChange(mapping.columnName, value)}
          />
        </div>
      </div>

      {isExpanded && isDetailsEnabled && (
        <RasterMappingRowDetails
          columnName={mapping.columnName}
          details={mapping.details}
          detailOptions={detailOptions}
          referencePeriodStart={mapping.referencePeriodStart}
          referencePeriodStop={mapping.referencePeriodStop}
          layerDescription={mapping.layerDescription}
          onDetailChange={onDetailChange}
          onReferencePeriodStartChange={onReferencePeriodStartChange}
          onReferencePeriodStopChange={onReferencePeriodStopChange}
          onLayerDescriptionChange={onLayerDescriptionChange}
        />
      )}
    </div>
  );
}
