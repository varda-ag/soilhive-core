import { Checkbox } from 'components/UI';
import useAvailability from 'hooks/useAvailability';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { DatasetsFilters } from './DatasetsFilters/DatasetsFilters';
import { DatasetsListItem } from './DatasetsListItem/DatasetsListItem';

import styles from './DatasetsList.module.scss';

export function DatasetsList() {
  const { datasets, selectAllDatasets, isAllSelected, isLoading, isNoData, isNoFilteredData, searchValue } = useAvailability();

  return isNoData ? (
    <i>No data in selected area</i>
  ) : isNoFilteredData ? (
    <i>No data in selected area due to applied filters</i>
  ) : (
    <div data-testid="sh-datasets-list" className={styles.DatasetsList}>
      <DatasetsFilters />
      {!!datasets.length && (
        <div className={styles.SelectAllWrapper}>
          <Checkbox size="small" label="Select all" value={isAllSelected} onChange={selectAllDatasets} />
        </div>
      )}
      <div className={styles.Wrapper}>
        {isLoading ? (
          <span data-testid="skeleton-container">
            <Skeleton count={1} height={120} />
            <Skeleton count={1} height={120} />
            <Skeleton count={1} height={120} />
          </span>
        ) : !datasets.length && searchValue ? (
          <i>No data in selected area matching your search query</i>
        ) : (
          datasets.map(dataset => <DatasetsListItem key={dataset.id} dataset={dataset} />)
        )}
      </div>
    </div>
  );
}
