import { useCallback, useState } from 'react';
import { TextInput } from 'components/UI';

import styles from './DatasetsFilters.module.scss';

export function DatasetsFilters() {
  const [searchValue, setSearchValue] = useState<string>('');

  const handleSearchChange = useCallback((value: string) => {
    setSearchValue(value);
  }, []);

  return (
    <div className={styles.DatasetsFilters}>
      <TextInput className={styles.Search} size="tiny" value={searchValue} placeholder="Search by name" onChange={handleSearchChange} />
    </div>
  );
}
