import CalendarIcon from 'assets/icons/small-calendar-icon.svg?react';

import styles from './DatasetsSidebarSummary.module.scss';
import { DatasetsSidebarSummaryItem } from './DatasetsSidebarSummaryItem/DatasetsSidebarSummaryItem';
import useAvailability from 'hooks/useAvailability';

export function DatasetsSidebarSummary() {
    const {datasetsSummary} = useAvailability();

    return (
        <div className={styles.DatasetsSidebarSummary}>
            <div className={styles.List}>
                <DatasetsSidebarSummaryItem
                    name="Datasets"
                    value={datasetsSummary.count}
                    color="#A2D1D1"
                />
                <DatasetsSidebarSummaryItem
                    name="Data Points"
                    value={datasetsSummary.dataPoints}
                    color="#F5B200"
                />
                <DatasetsSidebarSummaryItem
                    name="Raster layers"
                    value={datasetsSummary.layers}
                    color="#FF007A"
                />
                <DatasetsSidebarSummaryItem
                    name="Depth range"
                    value={datasetsSummary.depth}
                    color="#AA8B4D"
                />
            </div>
            <div className={styles.Date}>
                <CalendarIcon className={styles.Icon} /> {datasetsSummary.date}
            </div>
        </div>
    );
};
