import { useEffect, useImperativeHandle, useRef, type RefObject } from 'react';
import classnames from 'classnames';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import type { SortOrder, DataTableSortEvent, DataTablePageEvent } from 'primereact/datatable';
import type { IconOptions } from 'primereact/utils';

import SortingIcon from 'assets/icons/small-sorting-icon.svg?react';
import type { TableColumn } from 'types/components';

import styles from './Table.module.scss';

export interface TableHandle {
  resetColumnOrder: () => void;
  getElement: () => HTMLElement | null;
}

interface Props<T extends object> {
  value: T[];
  columns: TableColumn<T>[];
  rowClassName?: (row: T) => string | undefined;
  columnClassName?: string;
  emptyMessage?: string;
  scrollHeight?: string;
  className?: string;
  defaultSortField?: string;
  defaultSortOrder?: SortOrder;
  reorderableColumns?: boolean;
  dataKey?: string;
  paginator?: boolean;
  rows?: number;
  lazy?: boolean;
  first?: number;
  totalRecords?: number;
  onPage?: (page: number) => void;
  onSort?: (field: string, order: SortOrder) => void; // SortOrder = 1 | -1 | 0 | null | undefined
  onScrollNearBottom?: () => void;
  tableRef?: RefObject<TableHandle | null>;
}

export function Table<T extends object>({
  value,
  columns,
  rowClassName,
  columnClassName,
  emptyMessage,
  scrollHeight = 'flex',
  className,
  defaultSortField,
  defaultSortOrder,
  reorderableColumns = false,
  dataKey,
  paginator,
  rows,
  lazy,
  first,
  totalRecords,
  onPage,
  onSort,
  onScrollNearBottom,
  tableRef,
}: Props<T>) {
  const internalRef = useRef<DataTable<T[]>>(null);

  useImperativeHandle(tableRef, () => ({
    resetColumnOrder: () => (internalRef.current as any)?.resetColumnOrder?.(),
    getElement: () => (internalRef.current as any)?.getElement?.() as HTMLElement | null,
  }));

  useEffect(() => {
    if (!onScrollNearBottom) return;
    const el = (internalRef.current as any)?.getElement?.() as HTMLElement | null;
    const lastRow = el?.querySelector('.p-datatable-tbody tr:last-child') as HTMLElement | null;
    if (!lastRow) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onScrollNearBottom();
      },
      { threshold: 0.1 },
    );

    observer.observe(lastRow);
    return () => observer.disconnect();
  }, [value, onScrollNearBottom]);

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
      ref={internalRef}
      className={classnames('sh-primereact-table', className)}
      rowClassName={rowClassName}
      tableStyle={{ minWidth: '100%' }}
      value={value}
      removableSort
      scrollable
      scrollHeight={scrollHeight}
      sortIcon={customSortIcon}
      emptyMessage={emptyMessage}
      sortField={defaultSortField}
      sortOrder={defaultSortOrder}
      reorderableColumns={reorderableColumns}
      dataKey={dataKey}
      paginator={paginator}
      rows={rows}
      lazy={lazy}
      first={first}
      totalRecords={totalRecords}
      onPage={onPage ? (e: DataTablePageEvent) => onPage(e.page ?? 0) : undefined}
      onSort={onSort ? (e: DataTableSortEvent) => onSort(e.sortField, e.sortOrder) : undefined}
    >
      {columns.map(({ name, value: field, sortable, reorderable, headerTooltip, bodyTemplate, sortFunction }) => (
        <Column
          key={field}
          headerClassName={columnClassName}
          className={columnClassName}
          header={name}
          field={field}
          sortable={sortable}
          reorderable={reorderable}
          headerTooltip={headerTooltip}
          headerTooltipOptions={{ position: 'top' }}
          body={bodyTemplate}
          sortFunction={sortFunction}
        />
      ))}
    </DataTable>
  );
}
