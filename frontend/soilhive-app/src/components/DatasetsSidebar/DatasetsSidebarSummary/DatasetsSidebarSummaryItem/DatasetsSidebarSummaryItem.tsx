import styles from './DatasetsSidebarSummaryItem.module.scss';

interface Props {
  name: string;
  value: string | number;
  color: string;
}

export function DatasetsSidebarSummaryItem({ name, value, color }: Props) {
  return (
    <div data-testid="sh-datasets-sidebar-summary-item" className={styles.DatasetsSidebarSummaryItem}>
      <span className={styles.Value} style={{ color: color }}>
        {value}
      </span>
      <span className={styles.Name}>{name}</span>
    </div>
  );
}
