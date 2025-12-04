import CalendarIcon from 'assets/icons/small-calendar-icon.svg?react';

import styles from './DatasetsSidebarSummary.module.scss';
import { DatasetsSidebarSummaryItem } from './DatasetsSidebarSummaryItem/DatasetsSidebarSummaryItem';

const ITEMS = [
    {
        name: 'Datasets',
        value: '25',
        color: '#A2D1D1',
    },
    {
        name: 'Data Points',
        value: '236.756',
        color: '#F5B200',
    },
    {
        name: 'Raster layers',
        value: '13',
        color: '#FF007A',
    },
    {
        name: 'Depth range',
        value: '0-200',
        color: '#AA8B4D',
    }
]

export function DatasetsSidebarSummary() {
  return (
    <div className={styles.DatasetsSidebarSummary}>
        <div className={styles.List}>
            {ITEMS.map(({name, value, color}) => (
                <DatasetsSidebarSummaryItem
                    key={name}
                    name={name}
                    value={value}
                    color={color}
                />
            ))}
        </div>
        <div className={styles.Date}>
            <CalendarIcon className={styles.Icon} /> 2011 - 2025
        </div>
    </div>
  );
};
