import classnames from 'classnames';
import Skeleton from 'react-loading-skeleton';

import styles from './DatasetsSidebarSummaryItem.module.scss';

interface Props {
  name: string;
  value: string | number;
  color: string;
  preview?: boolean;
  isLoading?: boolean;
}

export function DatasetsSidebarSummaryItem({ name, value, color, preview, isLoading }: Props) {
  return (
    <div
      data-testid="sh-datasets-sidebar-summary-item"
      className={classnames(styles.DatasetsSidebarSummaryItem, { [styles.Preview]: preview })}
    >
      {isLoading && <Skeleton count={1} height={21} width={50} />}
      {!isLoading && (
        <span className={styles.Value} style={{ color: color }}>
          {value}
        </span>
      )}
      <span className={styles.Name}>{name}</span>
    </div>
  );
}
