import { Checkbox } from 'components/UI';
import useAvailability from 'hooks/useAvailability';
import { useTranslation } from 'react-i18next';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { DatasetsFilters } from './DatasetsFilters/DatasetsFilters';
import { DatasetsListItem } from './DatasetsListItem/DatasetsListItem';

import styles from './DatasetsList.module.scss';
import { NoDataMessage } from './NoDataMessage/NoDataMessage';

export function DatasetsList() {
  const { t } = useTranslation('availability');
  const { datasets, selectAllDatasets, isAllSelected, isDatasetsLoading, isNoData, isNoFilteredData, searchValue } = useAvailability();
  const showNoDataMessage = !isDatasetsLoading && (isNoData || isNoFilteredData);

  return showNoDataMessage ? (
    <NoDataMessage isNoData={isNoData} isNoFilteredData={isNoFilteredData} />
  ) : (
    <div data-testid="sh-datasets-list" className={styles.DatasetsList}>
      <DatasetsFilters />
      {!!datasets.length && (
        <div className={styles.SelectAllWrapper}>
          <Checkbox
            size="small"
            label={t('datasets_sidebar.select_all', 'Select all')}
            value={isAllSelected}
            onChange={selectAllDatasets}
          />
        </div>
      )}
      <div className={styles.Wrapper}>
        {isDatasetsLoading ? (
          <span data-testid="skeleton-container">
            <Skeleton count={1} height={95} />
            <Skeleton count={1} height={95} />
            <Skeleton count={1} height={95} />
          </span>
        ) : !datasets.length && searchValue ? (
          <i>{t('datasets_sidebar.no_data_matching_search')}</i>
        ) : (
          datasets.map(dataset => <DatasetsListItem key={dataset.id} dataset={dataset} />)
        )}
      </div>
    </div>
  );
}
