import styles from './DatasetsSidebarSummaryItem.module.scss';

interface Props {
    name: string,
    value?: string,
    color: string,
}

export function DatasetsSidebarSummaryItem({
    name,
    value = '-',
    color
}: Props) {
  return (
    <div className={styles.DatasetsSidebarSummaryItem}>
        <span className={styles.Value} style={{color: color}}>{value}</span>
        <span className={styles.Name}>{name}</span>
    </div>
  );
};
