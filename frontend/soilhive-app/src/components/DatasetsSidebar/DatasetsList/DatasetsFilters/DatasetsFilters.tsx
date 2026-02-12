import { TextInput } from 'components/UI';
import useAvailability from 'hooks/useAvailability';

import styles from './DatasetsFilters.module.scss';

export function DatasetsFilters() {
  const { searchValue, setSearchValue } = useAvailability();

  return (
    <div className={styles.DatasetsFilters}>
      <TextInput className={styles.Search} size="tiny" value={searchValue} placeholder="Search by name" onChange={setSearchValue} />
    </div>
  );
}
