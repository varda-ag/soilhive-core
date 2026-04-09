import { useTranslation } from 'react-i18next';
import classnames from 'classnames';

import CalendarIcon from 'assets/icons/small-calendar-icon.svg?react';
import { DatasetsSidebarSummaryItem } from './DatasetsSidebarSummaryItem/DatasetsSidebarSummaryItem';
import type { DatasetSummary } from 'types/availability';

import styles from './DatasetsSidebarSummary.module.scss';

interface Props {
  datasetsSummary: DatasetSummary;
  preview?: boolean;
}
export function DatasetsSidebarSummary({ datasetsSummary, preview }: Props) {
  const { t } = useTranslation('availability');

  return (
    <div className={classnames(styles.DatasetsSidebarSummary, { [styles.Preview]: preview })}>
      <div className={styles.List}>
        <DatasetsSidebarSummaryItem
          name={t('datasets_sidebar_summary.datasets')}
          value={datasetsSummary.count}
          color="#A2D1D1"
          preview={preview}
        />
        <DatasetsSidebarSummaryItem
          name={t('datasets_sidebar_summary.data_points')}
          value={datasetsSummary.dataPoints}
          color="#F5B200"
          preview={preview}
        />
        <DatasetsSidebarSummaryItem
          name={t('datasets_sidebar_summary.raster_layers')}
          value={datasetsSummary.layers}
          color="#FF007A"
          preview={preview}
        />
        <DatasetsSidebarSummaryItem
          name={t('datasets_sidebar_summary.depth_range')}
          value={datasetsSummary.depth}
          color="#AA8B4D"
          preview={preview}
        />
      </div>
      <div className={styles.Date}>
        <CalendarIcon className={styles.Icon} /> {datasetsSummary.date}
      </div>
    </div>
  );
}
