import CalendarIcon from 'assets/icons/small-calendar-icon.svg?react';
import { useTranslation } from 'react-i18next';

import styles from './DatasetsSidebarSummary.module.scss';
import { DatasetsSidebarSummaryItem } from './DatasetsSidebarSummaryItem/DatasetsSidebarSummaryItem';
import useAvailability from 'hooks/useAvailability';

export function DatasetsSidebarSummary() {
  const { t } = useTranslation('availability');
  const { datasetsSummary } = useAvailability();

  return (
    <div className={styles.DatasetsSidebarSummary}>
      <div className={styles.List}>
        <DatasetsSidebarSummaryItem name={t('datasets_sidebar_summary.datasets')} value={datasetsSummary.count} color="#A2D1D1" />
        <DatasetsSidebarSummaryItem name={t('datasets_sidebar_summary.data_points')} value={datasetsSummary.dataPoints} color="#F5B200" />
        <DatasetsSidebarSummaryItem name={t('datasets_sidebar_summary.raster_layers')} value={datasetsSummary.layers} color="#FF007A" />
        <DatasetsSidebarSummaryItem name={t('datasets_sidebar_summary.depth_range')} value={datasetsSummary.depth} color="#AA8B4D" />
      </div>
      <div className={styles.Date}>
        <CalendarIcon className={styles.Icon} /> {datasetsSummary.date}
      </div>
    </div>
  );
}
