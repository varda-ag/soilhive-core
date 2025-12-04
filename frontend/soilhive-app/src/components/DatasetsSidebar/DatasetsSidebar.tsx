import { useState } from 'react';
import FilterIcon from 'assets/icons/filter-icon.svg?react';
import CrossIcon from 'assets/icons/cross-icon.svg?react';
import { Button, TextInput, Dropdown, Checkbox } from 'components/UI';
import { DatasetsSidebarHeader } from './DatasetsSidebarHeader/DatasetsSidebarHeader';
import { DatasetsSidebarSummary } from './DatasetsSidebarSummary/DatasetsSidebarSummary';
import { DatasetsListItem } from './DatasetsListItem/DatasetsListItem';

import styles from './DatasetsSidebar.module.scss';

interface Props {
    onClose: () => void;
}

export function DatasetsSidebar({
    onClose
}: Props) {
  const [isOpened, setIsOpened] = useState<boolean>(false);

  return (
    <div className={styles.DatasetsSidebar}>
      <DatasetsSidebarHeader onClose={onClose} />
      <DatasetsSidebarSummary />

      <div className={styles.DatasetsList}>
        <div className={styles.Filters}>
          <TextInput className={styles.Search} size="tiny" placeholder="Search by name" />
          <Button className={styles.FilterButton} type="custom" size="medium"  onClick={() => setIsOpened(!isOpened)}>
            <>
              <FilterIcon /> Filter
            </>
          </Button>
          {isOpened && <div className={styles.FilterMenu}>
            <div className={styles.FilterHeader}>
              Filters <CrossIcon className={styles.CloseIcon} onClick={() => setIsOpened(false)}/>
            </div>
            <div className={styles.FilterBody}>
              <div className={styles.ClearWrapper}>
                <p className={styles.Clear} role="button">Clear</p>
              </div>
              <div className={styles.Inputs}>
                <Dropdown
                  className={styles.Dropdown}
                  label="Type of data"
                  placeholder="Select one or more"
                  options={[
                    {code: 'raster', name: 'Raster'},
                    {code: 'point', name: 'Point'},
                  ]}
                  size="tiny"
                  onChange={console.log}
                />

                <Dropdown
                  className={styles.Dropdown}
                  label="Data Ownership"
                  placeholder="Select one"
                  options={[
                    {code: 'global', name: 'Global'},
                    {code: 'private', name: 'Private'},
                  ]}
                  size="tiny"
                  onChange={console.log}
                />
              </div>
            </div>
          </div>} 
        </div>
        <div className={styles.SelectAllWrapper}>
          <Checkbox  size="small" label='Select all' />
        </div>
        <div className={styles.Wrapper}>
          <DatasetsListItem />
          <DatasetsListItem />
          <DatasetsListItem />
        </div>
      </div>

      <div className={styles.Action}>
        <Button
          className={styles.Button}
          isDisabled={true}
        >
          Download data
        </Button>
      </div>
    </div>
  );
};
