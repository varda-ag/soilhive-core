import { useTranslation } from 'react-i18next';
import { AutocompleteDropdown } from 'components/AutocompleteDropdown/AutocompleteDropdown';
import { TextInput, TextArea } from 'components/UI';
import InfoIcon from 'assets/icons/small-info-icon.svg?react';
import type { RowDetails, DetailOptionMap } from 'hooks/useRasterMappingStep';
import { AdditionalResourcesUpload } from './AdditionalResourcesUpload/AdditionalResourcesUpload';
import styles from './RasterMappingRowDetails.module.scss';

const LAYER_DESCRIPTION_MAX_LENGTH = 180;

interface Props {
  columnName: string;
  details: RowDetails;
  detailOptions: DetailOptionMap;
  referencePeriodStart: string | null;
  referencePeriodStop: string | null;
  layerDescription: string | null;
  additionalResources: { file_id: string }[];
  onDetailChange: (columnName: string, field: keyof RowDetails, value: string) => void;
  onReferencePeriodStartChange: (columnName: string, value: string) => void;
  onReferencePeriodStopChange: (columnName: string, value: string) => void;
  onLayerDescriptionChange: (columnName: string, value: string) => void;
  onAdditionalResourcesChange: (columnName: string, value: { file_id: string }[]) => void;
}

export function RasterMappingRowDetails({
  columnName,
  details,
  detailOptions,
  referencePeriodStart,
  referencePeriodStop,
  layerDescription,
  additionalResources,
  onDetailChange,
  onReferencePeriodStartChange,
  onReferencePeriodStopChange,
  onLayerDescriptionChange,
  onAdditionalResourcesChange,
}: Props) {
  const { t } = useTranslation('admin');

  return (
    <div className={styles.MappingRowDetails} data-testid="sh-mapping-row-details">
      <div className={styles.Note}>
        <InfoIcon className={styles.NoteIcon} />
        <span>{t('datasets.mappings.details.non_mandatory_note')}</span>
      </div>
      <div className={styles.Grid}>
        <div className={styles.FullRow}>
          <AutocompleteDropdown
            size="small"
            label={t('datasets.mappings.details.laboratory_method')}
            options={detailOptions.laboratoryMethod}
            value={details.laboratoryMethod ?? undefined}
            placeholder={t('datasets.mappings.details.laboratory_method_placeholder')}
            onChange={value => onDetailChange(columnName, 'laboratoryMethod', value as string)}
            onClear={() => onDetailChange(columnName, 'laboratoryMethod', '')}
          />
        </div>
        <TextInput
          size="small"
          type="number"
          label={t('datasets.mappings.details.reference_period_start')}
          placeholder={t('datasets.mappings.details.reference_period_start_placeholder')}
          value={referencePeriodStart ?? ''}
          onChange={value => onReferencePeriodStartChange(columnName, value)}
        />
        <TextInput
          size="small"
          type="number"
          label={t('datasets.mappings.details.reference_period_stop')}
          placeholder={t('datasets.mappings.details.reference_period_stop_placeholder')}
          value={referencePeriodStop ?? ''}
          onChange={value => onReferencePeriodStopChange(columnName, value)}
        />
      </div>
      <TextArea
        className={styles.LayerDescription}
        size="small"
        label={t('datasets.mappings.details.layer_description')}
        placeholder={t('datasets.mappings.details.layer_description_placeholder')}
        value={layerDescription ?? ''}
        maxLength={LAYER_DESCRIPTION_MAX_LENGTH}
        showCounter
        onChange={value => onLayerDescriptionChange(columnName, value)}
      />
      <div className={styles.AdditionalResources}>
        <p className={styles.AdditionalResourcesTitle}>
          {t('datasets.mappings.details.additional_resources_title')}{' '}
          <span className={styles.AdditionalResourcesSubtitle}>{t('datasets.mappings.details.additional_resources_subtitle')}</span>
        </p>
        <div className={styles.AdditionalResourcesContent}>
          <AdditionalResourcesUpload value={additionalResources} onChange={value => onAdditionalResourcesChange(columnName, value)} />
        </div>
      </div>
    </div>
  );
}
