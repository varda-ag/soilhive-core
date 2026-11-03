import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Dropdown } from 'components/UI';
import type { FileRasterBandDescriptor } from 'types/backend';

import styles from './FilterBandDropdown.module.scss';

interface Props {
  bands: FileRasterBandDescriptor[];
  value: number | null;
  onChange: (band: number) => void;
}

// Only one band of a multiband raster is installed, and the backend cannot guess which
export function FilterBandDropdown({ bands, value, onChange }: Props) {
  const { t } = useTranslation('admin');

  const options = useMemo(
    () =>
      bands.map(({ band_number, data_type }) => ({
        code: String(band_number),
        name: t('createFilter.band.option', { number: band_number, dataType: data_type }),
      })),
    [bands, t],
  );

  return (
    <Dropdown
      className={styles.FilterBandDropdown}
      size="small"
      name="band"
      label={t('createFilter.band.label')}
      placeholder={t('createFilter.band.placeholder')}
      helperMessage={t('createFilter.band.hint', { count: bands.length })}
      options={options}
      value={value === null ? undefined : String(value)}
      isRequired
      onChange={selected => onChange(Number(selected))}
    />
  );
}
