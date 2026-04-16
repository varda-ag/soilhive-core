import classnames from 'classnames';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import type { SortOrder } from 'primereact/datatable';
import type { IconOptions } from 'primereact/utils';

import SortingIcon from 'assets/icons/small-sorting-icon.svg?react';
import type { TableColumn } from 'types/components';

import styles from './Table.module.scss';

interface Props<T extends object> {
  value: T[];
  columns: TableColumn<T>[];
  rowClassName?: (row: T) => string | undefined;
  columnClassName?: string;
  emptyMessage?: string;
  scrollHeight?: string;
  className?: string;
}

export function Table<T extends object>({
  value,
  columns,
  rowClassName,
  columnClassName,
  emptyMessage,
  scrollHeight = 'flex',
  className,
}: Props<T>) {
  const customSortIcon = (options: IconOptions<DataTable<T[]>, { sortOrder?: SortOrder; sorted?: boolean }>) => {
    const sortOrder = options.sortOrder || 0;

    return options.sorted ? (
      sortOrder < 0 ? (
        <SortingIcon className={classnames(options.iconProps.className, styles.SortUp)} />
      ) : (
        <SortingIcon className={classnames(options.iconProps.className, styles.SortDown)} />
      )
    ) : (
      <SortingIcon className={classnames(options.iconProps.className, styles.SortNone)} />
    );
  };

  return (
    <DataTable
      className={classnames('sh-primereact-table', className)}
      rowClassName={rowClassName}
      tableStyle={{ minWidth: '100%' }}
      value={value}
      removableSort
      scrollable
      scrollHeight={scrollHeight}
      sortIcon={customSortIcon}
      emptyMessage={emptyMessage}
    >
      {columns.map(({ name, value: field, sortable, bodyTemplate, sortFunction }) => (
        <Column
          key={field}
          headerClassName={columnClassName}
          className={columnClassName}
          header={name}
          field={field}
          sortable={sortable}
          body={bodyTemplate}
          sortFunction={sortFunction}
        />
      ))}
    </DataTable>
  );
}
