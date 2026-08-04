import type { ReactNode } from 'react';
import classnames from 'classnames';
import styles from './MappingsTable.module.scss';

interface Props {
  columnMappings: { columnName: string }[];
  headerCells: string[];
  dataTestId: string;
  renderRow: (columnName: string) => ReactNode;
}

export function MappingsTable({ columnMappings, headerCells, dataTestId, renderRow }: Props) {
  const hasExtraColumn = headerCells.length > 3;

  return (
    <div className={styles.MappingsTable} data-testid={dataTestId}>
      <div className={classnames(styles.Header, { [styles.HeaderWithExtra]: hasExtraColumn })}>
        <div className={styles.HeaderSpacer} />
        {headerCells.map(cell => (
          <span key={cell} className={styles.HeaderCell}>
            {cell}
          </span>
        ))}
      </div>

      <div className={styles.Rows}>{columnMappings.map(mapping => renderRow(mapping.columnName))}</div>
    </div>
  );
}
