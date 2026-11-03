import { useTranslation } from 'react-i18next';

import { Button, TextInput } from 'components/UI';
import TrashIcon from 'assets/icons/trash-icon.svg?react';
import InfoIcon from 'assets/icons/small-info-icon.svg?react';
import type { FilterMappingRow } from 'hooks/useFilterMappings';

import styles from './FilterMappings.module.scss';

interface Props {
  rows: FilterMappingRow[];
  onLabelChange: (pixelValue: string, label: string) => void;
  onClear: (pixelValue: string) => void;
}

export function FilterMappings({ rows, onLabelChange, onClear }: Props) {
  const { t } = useTranslation('admin');

  return (
    <div className={styles.FilterMappings}>
      <div className={styles.Hint}>
        <InfoIcon />
        {t('createFilter.mappings.unlabelled_hint')}
      </div>

      <table className={styles.Table}>
        <thead>
          <tr>
            <th>{t('createFilter.mappings.pixel_value')}</th>
            <th>{t('createFilter.mappings.label')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ pixelValue, label }) => (
            <tr key={pixelValue}>
              <td>
                <TextInput className={styles.PixelValueInput} name={`pixel-value-${pixelValue}`} value={pixelValue} isDisabled />
              </td>
              <td>
                <TextInput
                  className={styles.LabelInput}
                  name={`label-${pixelValue}`}
                  value={label}
                  onChange={value => onLabelChange(pixelValue, value)}
                />
              </td>
              <td>
                <Button
                  type="tertiary"
                  size="tiny"
                  isIconOnly
                  ariaLabel={t('createFilter.mappings.clear')}
                  title={t('createFilter.mappings.clear')}
                  dataTestId="sh-filter-mapping-clear"
                  onClick={() => onClear(pixelValue)}
                >
                  <TrashIcon className={styles.ClearIcon} />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
