import { useState } from 'react';
import classnames from 'classnames';

import { Button, Checkbox, Tag } from 'components/UI';
import ArrowDownIcon from 'assets/icons/dropdown-arrow-down-icon.svg?react';
import MapIcon from 'assets/icons/small-map-icon.svg?react';
import RullerIcon from 'assets/icons/small-ruller-icon.svg?react';
import LayersIcon from 'assets/icons/small-layers-icon.svg?react';
import CalendarIcon from 'assets/icons/small-calendar-icon.svg?react';
import type { AvailabilityDataset } from 'types/availability';

import styles from './DatasetsListItem.module.scss';
import useAvailability from 'hooks/useAvailability';

type Props = {
  dataset: AvailabilityDataset;
};
export function DatasetsListItem({ dataset }: Props) {
  const { selectedDatasets, selectDataset } = useAvailability();
  const [isOpened, setIsOpened] = useState<boolean>(false);

  return (
    <div data-testid="sh-datasets-list-item" className={classnames(styles.DatasetsListItem, { [styles.Opened]: isOpened })}>
      <div className={styles.Main}>
        <div className={styles.Top}>
          <div className={styles.Title}>
            <Checkbox
              label={dataset.name}
              size="small"
              value={selectedDatasets.includes(dataset.id)}
              onChange={() => selectDataset(dataset.id)}
            />
            <ArrowDownIcon className={styles.DropdownIcon} onClick={() => setIsOpened(!isOpened)} />
          </div>
          <div className={styles.Tags}>
            {dataset.tags.map((tag, index) => (
              <Tag key={tag} text={tag} type={index > 0 ? 'primary' : undefined} />
            ))}
          </div>
        </div>
        <div className={styles.Bottom}>
          <Button size="tiny">Metadata</Button>
        </div>
      </div>
      <div className={styles.MetaWrapper}>
        <div className={styles.Meta}>
          <p className={styles.MetaItem}>
            <MapIcon className={styles.PointsIcon} /> {dataset.properties.points} points
          </p>
          <p className={styles.MetaItem}>
            <LayersIcon className={styles.LayersIcon} /> {dataset.properties.layers} raster layers
          </p>
          <p className={styles.MetaItem}>
            <RullerIcon className={styles.DepthIcon} /> {dataset.properties.minDepth}-{dataset.properties.maxDepth} cm
          </p>
          <p className={styles.MetaItem}>
            <CalendarIcon className={styles.DateIcon} /> {dataset.properties.dateStart} - {dataset.properties.dateEnd}
          </p>
        </div>
      </div>
    </div>
  );
}
