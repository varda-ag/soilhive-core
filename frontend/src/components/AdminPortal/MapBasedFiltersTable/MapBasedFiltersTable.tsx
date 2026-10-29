import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnSortEvent } from 'primereact/column';
import { MapBasedFiltersTableStatusTemplate } from './MapBasedFiltersTableStatusTemplate/MapBasedFiltersTableStatusTemplate';
import { MapBasedFiltersTableActionTemplate } from './MapBasedFiltersTableActionTemplate/MapBasedFiltersTableActionTemplate';
import { Table } from 'components/Table/Table';
import { type RasterFilterCategory } from 'types/backend';
import type { TableColumn } from 'types/components';
import { dateStringToDDMMYYYY } from '../../../utilities/date';

import styles from './MapBasedFiltersTable.module.scss';

const DISABLED_SORT_ORDER = 0;
const INACTIVE_SORT_ORDER = 1;
const ACTIVE_SORT_ORDER = 2;

const statusSortValue = (filter: RasterFilterCategory) =>
  !filter.enabled ? DISABLED_SORT_ORDER : !filter.active ? INACTIVE_SORT_ORDER : ACTIVE_SORT_ORDER;

interface Props {
  filters: RasterFilterCategory[];
  isActivationPending: boolean;
  onEdit: (id: string) => void;
  onDelete: (filter: RasterFilterCategory) => void;
  onSetCategoryActive: (rasterFilterId: string, active: boolean) => void;
}

export function MapBasedFiltersTable({ filters, isActivationPending, onEdit, onDelete, onSetCategoryActive }: Props) {
  const { t } = useTranslation('admin');

  const statusSortFunction = useCallback((event: ColumnSortEvent) => {
    return [...event.data].sort((a: RasterFilterCategory, b: RasterFilterCategory) => {
      return (event.order || 0) * (statusSortValue(a) - statusSortValue(b));
    });
  }, []);

  const nameBodyTemplate = useCallback((filter: RasterFilterCategory) => <div className={styles.NameCell}>{filter.name}</div>, []);

  const statusBodyTemplate = useCallback(
    (filter: RasterFilterCategory) => (
      <MapBasedFiltersTableStatusTemplate
        filter={filter}
        isActivationPending={isActivationPending}
        onSetCategoryActive={onSetCategoryActive}
      />
    ),
    [isActivationPending, onSetCategoryActive],
  );

  const actionsBodyTemplate = useCallback(
    (filter: RasterFilterCategory) => <MapBasedFiltersTableActionTemplate filter={filter} onEdit={onEdit} onDelete={onDelete} />,
    [onDelete, onEdit],
  );

  const columns: TableColumn<RasterFilterCategory>[] = useMemo(
    () => [
      { name: t('filters.list.columns.name'), value: 'name', sortable: true, bodyTemplate: nameBodyTemplate },
      {
        name: t('filters.list.columns.status'),
        value: 'enabled',
        sortable: true,
        bodyTemplate: statusBodyTemplate,
        sortFunction: statusSortFunction,
      },
      {
        name: t('filters.list.columns.created_at'),
        value: 'created_at',
        sortable: true,
        bodyTemplate: ({ created_at, created_by }: { created_at: string; created_by: string | null }) => (
          <div className={styles.CreatedAtCell}>
            <span>{dateStringToDDMMYYYY(new Date(created_at))}</span>
            <span>{created_by ?? '—'}</span>
          </div>
        ),
      },
      {
        name: t('filters.list.columns.actions'),
        value: 'actions',
        sortable: false,
        bodyTemplate: actionsBodyTemplate,
      },
    ],
    [t, nameBodyTemplate, statusBodyTemplate, actionsBodyTemplate, statusSortFunction],
  );

  return (
    <div className={styles.MapBasedFiltersTable}>
      <Table
        value={filters}
        columns={columns}
        columnClassName={styles.TableColumn}
        emptyMessage={t('filters.list.empty_message')}
        defaultSortField="created_at"
        defaultSortOrder={-1}
        dataKey="id"
      />
    </div>
  );
}
