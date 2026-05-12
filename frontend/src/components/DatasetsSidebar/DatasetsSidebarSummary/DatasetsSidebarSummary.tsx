import { useTranslation } from 'react-i18next';
import classnames from 'classnames';
import Skeleton from 'react-loading-skeleton';

import CalendarIcon from 'assets/icons/small-calendar-icon.svg?react';
import { DatasetsSidebarSummaryItem } from './DatasetsSidebarSummaryItem/DatasetsSidebarSummaryItem';
import type { DatasetSummary } from 'types/availability';

import styles from './DatasetsSidebarSummary.module.scss';

interface Props {
  datasetsSummary: DatasetSummary;
  preview?: boolean;
  isLoading?: boolean;
  isCountLoading?: boolean;
}
export function DatasetsSidebarSummary({ datasetsSummary, preview, isCountLoading, isLoading }: Props) {
  const { t } = useTranslation('availability');

  return (
    <div className={classnames(styles.DatasetsSidebarSummary, { [styles.Preview]: preview })}>
      <div className={styles.List}>
        <DatasetsSidebarSummaryItem
          name={t('datasets_sidebar_summary.datasets')}
          value={datasetsSummary.count}
          color="#A2D1D1"
          preview={preview}
          isLoading={isCountLoading}
        />
        <DatasetsSidebarSummaryItem
          name={t('datasets_sidebar_summary.data_points')}
          value={datasetsSummary.dataPoints}
          color="#F5B200"
          preview={preview}
          isLoading={isLoading}
        />
        <DatasetsSidebarSummaryItem
          name={t('datasets_sidebar_summary.raster_layers')}
          value={datasetsSummary.layers}
          color="#FF007A"
          preview={preview}
          isLoading={isLoading}
        />
        <DatasetsSidebarSummaryItem
          name={t('datasets_sidebar_summary.depth_range')}
          value={datasetsSummary.depth}
          color="#AA8B4D"
          preview={preview}
          isLoading={isLoading}
        />
      </div>
      <div className={styles.Date}>
        {isLoading ? (
          <Skeleton count={1} height={16} width={50} />
        ) : (
          <>
            <CalendarIcon className={styles.Icon} /> {datasetsSummary.date}
          </>
        )}
      </div>
    </div>
  );
}
