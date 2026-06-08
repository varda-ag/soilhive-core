import { useState } from 'react';
import classnames from 'classnames';

import { Button, Checkbox, Tag } from 'components/UI';
import ArrowDownIcon from 'assets/icons/dropdown-arrow-down-icon.svg?react';
import MapIcon from 'assets/icons/small-map-icon.svg?react';
import RullerIcon from 'assets/icons/small-ruller-icon.svg?react';
import LayersIcon from 'assets/icons/small-layers-icon.svg?react';
import CalendarIcon from 'assets/icons/small-calendar-icon.svg?react';
import NewTabIcon from 'assets/icons/small-new-tab-icon.svg?react';
import type { AvailabilityDataset } from 'types/availability';

import styles from './DatasetsListItem.module.scss';
import useAvailability from 'hooks/useAvailability';
import { useTranslation } from 'react-i18next';
import { MetaItem } from './MetaItem/MetaItem';
import { GISDataType } from '../../../../types/backend';

type Props = {
  dataset: AvailabilityDataset;
};
export function DatasetsListItem({ dataset }: Props) {
  const { selectedDatasets, selectDataset, isCoverageLoading } = useAvailability();
  const [isOpened, setIsOpened] = useState<boolean>(false);
  const { t } = useTranslation('availability');

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
          <Button size="tiny" type="custom" className={styles.MetadataButton} href={`/datasets/${dataset.id}`}>
            <NewTabIcon /> {t('datasets_list.metadata')}
          </Button>
          {dataset.visibility && <Tag className={styles.VisibilityTag} text={t(`datasets_list.${dataset.visibility}`)} />}
        </div>
      </div>
      <div className={styles.MetaWrapper}>
        <div className={styles.Meta}>
          {dataset.dataType === GISDataType.POINT && (
            <MetaItem icon={<MapIcon className={styles.PointsIcon} />} isLoading={isCoverageLoading}>
              {dataset.properties.points} {t('datasets_list.points_suffix')}
            </MetaItem>
          )}
          {dataset.dataType === GISDataType.RASTER && (
            <MetaItem icon={<LayersIcon className={styles.LayersIcon} />} isLoading={isCoverageLoading}>
              {dataset.properties.layers} {t('datasets_list.raster_layers_suffix')}
            </MetaItem>
          )}
          <MetaItem icon={<RullerIcon className={styles.DepthIcon} />} isLoading={isCoverageLoading}>
            {dataset.properties.minDepth}-{dataset.properties.maxDepth} {t('datasets_list.depth_cm_suffix')}
          </MetaItem>
          <MetaItem icon={<CalendarIcon className={styles.DateIcon} />} isLoading={isCoverageLoading}>
            {dataset.properties.dateStart} {t('datasets_list.date_range_separator')} {dataset.properties.dateEnd}
          </MetaItem>
        </div>
      </div>
    </div>
  );
}
