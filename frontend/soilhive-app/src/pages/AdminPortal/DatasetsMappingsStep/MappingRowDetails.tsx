import { useTranslation } from 'react-i18next';
import { AutocompleteDropdown } from 'components/UI';
import InfoIcon from 'assets/icons/small-info-icon.svg?react';
import type { RowDetails, DetailOptionMap } from 'hooks/useMappingsStep';
import styles from './MappingRowDetails.module.scss';

interface Props {
  columnName: string;
  details: RowDetails;
  detailOptions: DetailOptionMap;
  onDetailChange: (columnName: string, field: keyof RowDetails, value: string) => void;
}

export function MappingRowDetails({ columnName, details, detailOptions, onDetailChange }: Props) {
  const { t } = useTranslation('admin');

  const fields: { key: keyof RowDetails; label: string }[] = [
    { key: 'samplePretreatment', label: t('datasets.mappings.details.sample_pretreatment') },
    { key: 'attractionRatio', label: t('datasets.mappings.details.attraction_ratio') },
    { key: 'technique', label: t('datasets.mappings.details.technique') },
    { key: 'extractionBase', label: t('datasets.mappings.details.extraction_base') },
    { key: 'extractantFormulation', label: t('datasets.mappings.details.extractant_formulation') },
    { key: 'instrument', label: t('datasets.mappings.details.instrument') },
    { key: 'extractantConcentration', label: t('datasets.mappings.details.extractant_concentration') },
    { key: 'limitOfDetection', label: t('datasets.mappings.details.limit_of_detection') },
  ];

  return (
    <div className={styles.MappingRowDetails} data-testid="sh-mapping-row-details">
      <div className={styles.Note}>
        <InfoIcon className={styles.NoteIcon} />
        <span>{t('datasets.mappings.details.non_mandatory_note')}</span>
      </div>
      <div className={styles.Grid}>
        {fields.map(({ key, label }) => (
          <AutocompleteDropdown
            key={key}
            size="small"
            label={label}
            options={detailOptions[key]}
            value={details[key] ?? undefined}
            placeholder={t('datasets.mappings.row.unit_placeholder')}
            onChange={value => onDetailChange(columnName, key, value as string)}
          />
        ))}
      </div>
    </div>
  );
}
