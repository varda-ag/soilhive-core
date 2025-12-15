import { useCallback, useState } from 'react';
import FilterIcon from 'assets/icons/filter-icon.svg?react';
import CrossIcon from 'assets/icons/cross-icon.svg?react';
import { Button, TextInput, Dropdown } from 'components/UI';

import styles from './DatasetsFilters.module.scss';

interface DatasetFilters {
  type: string[];
  ownership: string;
}

export function DatasetsFilters() {
  const [searchValue, setSearchValue] = useState<string>('');
  const [filtersValue, setFiltersValue] = useState<DatasetFilters>({
    type: [],
    ownership: '',
  });
  const [isFiltersOpened, setIsFiltersOpened] = useState<boolean>(false);

  const handleFilterChange = useCallback(
    (value: string | string[], name: string) => {
      setFiltersValue({
        ...filtersValue,
        [name]: value,
      });
    },
    [filtersValue],
  );

  const resetFilters = useCallback(() => {
    setFiltersValue({
      type: [],
      ownership: '',
    });
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchValue(value);
  }, []);

  return (
    <div className={styles.DatasetsFilters}>
      <TextInput className={styles.Search} size="tiny" value={searchValue} placeholder="Search by name" onChange={handleSearchChange} />
      <Button className={styles.FilterButton} type="custom" size="medium" onClick={() => setIsFiltersOpened(!isFiltersOpened)}>
        <>
          <FilterIcon /> Filter
        </>
      </Button>
      {isFiltersOpened && (
        <div className={styles.FilterMenu}>
          <div className={styles.FilterHeader}>
            Filters <CrossIcon className={styles.CloseIcon} onClick={() => setIsFiltersOpened(false)} />
          </div>
          <div className={styles.FilterBody}>
            <div className={styles.ClearWrapper}>
              <p className={styles.Clear} role="button" onClick={resetFilters}>
                Clear
              </p>
            </div>
            <div className={styles.Inputs}>
              <Dropdown
                className={styles.Dropdown}
                label="Type of data"
                name="type"
                value={filtersValue.type}
                placeholder="Select one or more"
                options={[
                  { code: 'raster', name: 'Raster' },
                  { code: 'point', name: 'Point' },
                ]}
                size="tiny"
                isMultiselect={true}
                onChange={(value, name) => handleFilterChange(value, name as string)}
              />

              <Dropdown
                className={styles.Dropdown}
                label="Data Ownership"
                name="ownership"
                value={filtersValue.ownership}
                placeholder="Select one"
                options={[
                  { code: 'global', name: 'Global' },
                  { code: 'private', name: 'Private' },
                ]}
                size="tiny"
                onChange={(value, name) => handleFilterChange(value, name as string)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
