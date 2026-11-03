import { useTranslation } from 'react-i18next';
import classnames from 'classnames';

import { Tag, ToggleButton } from 'components/UI';
import { RasterFilterInstallStatus, type RasterFilterCategory } from 'types/backend';
import { getInstallStatus, isInstallInProgress } from 'utilities/rasterFilter';

import styles from './MapBasedFiltersTableStatusTemplate.module.scss';

interface Props {
  filter: RasterFilterCategory;
  isActivationPending: boolean;
  onSetCategoryActive: (rasterFilterId: string, active: boolean) => void;
}

export function MapBasedFiltersTableStatusTemplate({ filter, isActivationPending, onSetCategoryActive }: Props) {
  const { t } = useTranslation('admin');
  const installStatus = getInstallStatus(filter);

  return (
    <div className={styles.StatusCell}>
      {!filter.enabled && (
        <Tag
          text={t(`filters.list.install_status.${installStatus}`)}
          className={classnames(styles.Tag, {
            [styles.InProgress]: isInstallInProgress(installStatus),
            [styles.Failed]: installStatus === RasterFilterInstallStatus.FAILED,
          })}
        />
      )}
      {filter.enabled && (
        <div className={styles.ToggleWrapper}>
          <ToggleButton
            checked={filter.active}
            onChange={checked => onSetCategoryActive(filter.id, checked)}
            disabled={isActivationPending}
          />
          <span className={styles.ActiveLabel}>{filter.active ? t('filters.list.deactivate') : t('filters.list.activate')}</span>
        </div>
      )}
    </div>
  );
}
