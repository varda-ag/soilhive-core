import { useState } from 'react';
import classnames from 'classnames';

import { Button, Checkbox, Tag } from 'components/UI';
import ArrowDownIcon from 'assets/icons/dropdown-arrow-down-icon.svg?react';
// import ArrowUpIcon from 'assets/icons/dropdown-arrow-up-icon.svg?react';
import EyeIcon from 'assets/icons/small-eye-icon.svg?react';
import MapIcon from 'assets/icons/small-map-icon.svg?react';
import RullerIcon from 'assets/icons/small-ruller-icon.svg?react';
import LayersIcon from 'assets/icons/small-layers-icon.svg?react';
import CalendarIcon from 'assets/icons/small-calendar-icon.svg?react';

import styles from './DatasetsListItem.module.scss';

export function DatasetsListItem() {
  const [isOpened, setIsOpened] = useState<boolean>(false);

  // const DropdownIcon = useMemo(() => {
  //   return isOpened ? ArrowUpIcon : ArrowDownIcon;
  // }, [isOpened])

  return (
    <div
      data-testid="sh-datasets-list-item"
      className={classnames(
        styles.DatasetsListItem,
        {[styles.Opened]: isOpened}
      )}
    >
      <div className={styles.Main}>
        <div className={styles.Top}>
          <div className={styles.Title}>
            <Checkbox label="SoilGrids 250m" size="small" />
            <ArrowDownIcon
              className={styles.DropdownIcon}
              onClick={() => setIsOpened(!isOpened)}
            />
          </div>
          <div className={styles.Tags}>
            <Tag text="Global" />
            <Tag text="Private" type="primary"/>
          </div>
        </div>
        <div className={styles.Bottom}>
          <Button size="tiny" onClick={() => console.log('Click')}>Metadata</Button>
          <div className={styles.Views}><EyeIcon /> 12.3k</div>
        </div>
      </div>
      <div className={styles.MetaWrapper}>
        <div className={styles.Meta}>
          <p className={styles.MetaItem}>
            <MapIcon className={styles.PointsIcon} /> 34.546 points
          </p>
          <p className={styles.MetaItem}>
            <LayersIcon className={styles.LayersIcon} /> 12 raster layers
          </p>
          <p className={styles.MetaItem}>
            <RullerIcon className={styles.DepthIcon} /> 0-60 cm
          </p>
          <p className={styles.MetaItem}>
            <CalendarIcon className={styles.DateIcon} /> 2012 - 2024
          </p>
        </div>
      </div>
    </div>
  );
};
