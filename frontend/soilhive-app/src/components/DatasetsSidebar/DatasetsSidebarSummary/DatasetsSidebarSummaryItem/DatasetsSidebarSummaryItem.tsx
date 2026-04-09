import classnames from 'classnames';
import styles from './DatasetsSidebarSummaryItem.module.scss';

interface Props {
  name: string;
  value: string | number;
  color: string;
  preview?: boolean;
}

export function DatasetsSidebarSummaryItem({ name, value, color, preview }: Props) {
  return (
    <div
      data-testid="sh-datasets-sidebar-summary-item"
      className={classnames(styles.DatasetsSidebarSummaryItem, { [styles.Preview]: preview })}
    >
      <span className={styles.Value} style={{ color: color }}>
        {value}
      </span>
      <span className={styles.Name}>{name}</span>
    </div>
  );
}
