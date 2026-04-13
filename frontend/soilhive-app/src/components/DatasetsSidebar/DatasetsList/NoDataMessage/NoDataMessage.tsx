import { useTranslation } from 'react-i18next';
import NoDataIcon from 'assets/icons/no-data-icon.svg?react';
import useAvailability from '../../../../hooks/useAvailability';
import styles from './NoDataMessage.module.scss';

interface Props {
  isNoData: boolean;
  isNoFilteredData: boolean;
}

export function NoDataMessage({ isNoData, isNoFilteredData }: Props) {
  const { t } = useTranslation('availability');
  const { clearAllFilters } = useAvailability();

  const message = isNoData ? (
    t('datasets_sidebar.no_data_in_selected_area')
  ) : isNoFilteredData ? (
    <>
      <div className={styles.Actions}>
        <span className={styles.ClearAll} data-testid="sh-dataset-sidebar-clear-all" role="button" onClick={clearAllFilters}>
          {t('filtering_sidebar.clear_all')}
        </span>
        &nbsp;
        {t('datasets_sidebar.no_data_in_selected_area_due_to_filters')}
      </div>
    </>
  ) : null;

  return (
    <div className={styles.NoDataMessage}>
      <NoDataIcon />
      <div className={styles.Title}>{t('datasets_sidebar.no_data_available')}</div>
      {message}
    </div>
  );
}
