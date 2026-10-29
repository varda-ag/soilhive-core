import { useTranslation } from 'react-i18next';

import { Tag, ToggleButton } from 'components/UI';
import type { RasterFilterCategory } from 'types/backend';

import styles from './MapBasedFiltersTableStatusTemplate.module.scss';

interface Props {
  filter: RasterFilterCategory;
  isLoading: boolean;
  onSetCategoryActive: (rasterFilterId: string, active: boolean) => void;
}

export function MapBasedFiltersTableStatusTemplate({ filter, isLoading, onSetCategoryActive }: Props) {
  const { t } = useTranslation('admin');

  return (
    <div className={styles.StatusCell}>
      {!filter.enabled && <Tag text={t(`filters.list.not_installed`)} className={styles.Tag} />}
      {filter.enabled && (
        <div className={styles.ToggleWrapper}>
          <ToggleButton checked={filter.active} onChange={checked => onSetCategoryActive(filter.id, checked)} disabled={isLoading} />
          <span className={styles.ActiveLabel}>{filter.active ? t('filters.list.deactivate') : t('filters.list.activate')}</span>
        </div>
      )}
    </div>
  );
}
