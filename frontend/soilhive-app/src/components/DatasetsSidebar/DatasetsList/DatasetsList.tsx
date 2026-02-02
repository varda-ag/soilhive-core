import { Checkbox } from 'components/UI';
import { DatasetsListItem } from './DatasetsListItem/DatasetsListItem';
import { DatasetsFilters } from './DatasetsFilters/DatasetsFilters';
import useAvailability from 'hooks/useAvailability';

import styles from './DatasetsList.module.scss';

export function DatasetsList() {
  const { datasets, selectAllDatasets, isAllSelected, isLoading, isNoData, isNoFilteredData } = useAvailability();
  return isLoading ? (
    <span>⌛</span>
  ) : isNoData ? (
    <i>No data in selected area</i>
  ) : isNoFilteredData ? (
    <i>No data in selected area due to applied filters</i>
  ) : (
    <div data-testid="sh-datasets-list" className={styles.DatasetsList}>
      <DatasetsFilters />
      <div className={styles.SelectAllWrapper}>
        <Checkbox size="small" label="Select all" value={isAllSelected} onChange={selectAllDatasets} />
      </div>
      <div className={styles.Wrapper}>
        {datasets.map(dataset => (
          <DatasetsListItem key={dataset.id} dataset={dataset} />
        ))}
      </div>
    </div>
  );
}
