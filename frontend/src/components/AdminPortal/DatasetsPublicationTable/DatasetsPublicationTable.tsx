import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnSortEvent } from 'primereact/column';
import WarningIcon from 'assets/icons/small-warning-icon.svg?react';
import { DatasetsTableStatusTemplate } from './DatasetsTableStatusTemplate/DatasetsTableStatusTemplate';
import { DatasetsTableVisibilityTemplate } from './DatasetsTableVisibilityTemplate/DatasetsTableVisibilityTemplate';
import { DatasetsTableActionTemplate } from './DatasetsTableActionTemplate/DatasetsTableActionTemplate';
import { Table } from 'components/Table/Table';
import { IngestionStatus } from 'types/backend';
import type { TableColumn } from 'types/components';
import type { DatasetsPublicationListItem } from 'types/datasetsPublication';
import { dateStringToDDMMYYYY } from '../../../utilities/date';

import styles from './DatasetsPublicationTable.module.scss';

const statusSortingMap = {
  [IngestionStatus.PENDING]: 0,
  [IngestionStatus.ONGOING]: 2,
  [IngestionStatus.STAGED]: 3,
  [IngestionStatus.LOADED]: 4,
  [IngestionStatus.PUBLISHED]: 5,
};

// Queued comes before any work has started, so between PENDING and ONGOING
const QUEUED_SORT_ORDER = 1;

const statusSortValue = (dataset: DatasetsPublicationListItem) =>
  dataset.isQueued ? QUEUED_SORT_ORDER : (statusSortingMap[dataset.status] ?? 0);

interface Props {
  datasets: DatasetsPublicationListItem[];
  isSearch: boolean;
  onEdit: (id: string) => void;
  onDelete: (dataset: DatasetsPublicationListItem) => void;
  onPublish: (id: string) => void;
  onShowErrors: (dataset: DatasetsPublicationListItem) => void;
}

export function DatasetsPublicationTable({ datasets, isSearch, onEdit, onDelete, onPublish, onShowErrors }: Props) {
  const { t } = useTranslation('admin');

  const statusSortFunction = useCallback((event: ColumnSortEvent) => {
    return [...event.data].sort((a: DatasetsPublicationListItem, b: DatasetsPublicationListItem) => {
      return (event.order || 0) * (statusSortValue(a) - statusSortValue(b));
    });
  }, []);

  const nameBodyTemplate = useCallback(
    (dataset: DatasetsPublicationListItem) => (
      <div className={styles.NameCell}>
        {dataset.hasErrors && <WarningIcon className={styles.NameWarningIcon} />}
        <div className={styles.NameCellTextBlock}>
          <span className={styles.NameCellName}>{dataset.name}</span>
          {dataset.gis_datatype && <span className={styles.NameCellType}>{dataset.gis_datatype}</span>}
        </div>
      </div>
    ),
    [],
  );

  const statusBodyTemplate = useCallback(
    (dataset: DatasetsPublicationListItem) => <DatasetsTableStatusTemplate dataset={dataset} onShowErrors={onShowErrors} />,
    [onShowErrors],
  );

  const actionsBodyTemplate = useCallback(
    (dataset: DatasetsPublicationListItem) => (
      <DatasetsTableActionTemplate dataset={dataset} onEdit={onEdit} onDelete={onDelete} onPublish={onPublish} />
    ),
    [onDelete, onEdit, onPublish],
  );

  const columns: TableColumn<DatasetsPublicationListItem>[] = useMemo(
    () => [
      { name: t('datasets.list.columns.name'), value: 'name', sortable: true, bodyTemplate: nameBodyTemplate },
      {
        name: t('datasets.list.columns.status'),
        value: 'status',
        sortable: true,
        bodyTemplate: statusBodyTemplate,
        sortFunction: statusSortFunction,
      },
      { name: t('datasets.list.columns.visibility'), value: 'visibility', sortable: true, bodyTemplate: DatasetsTableVisibilityTemplate },
      {
        name: t('datasets.list.columns.updated_at'),
        value: 'updated_at',
        sortable: true,
        bodyTemplate: ({ updated_at, updated_by }: { updated_at: Date | null; updated_by?: string | null }) => (
          <div className={styles.UpdatedAtCell}>
            <span>{dateStringToDDMMYYYY(updated_at)}</span>
            <span>{updated_by ?? '—'}</span>
          </div>
        ),
      },
      {
        name: t('datasets.list.columns.actions'),
        value: 'actions',
        sortable: false,
        bodyTemplate: actionsBodyTemplate,
      },
    ],
    [t, nameBodyTemplate, statusBodyTemplate, actionsBodyTemplate, statusSortFunction],
  );

  const rowClassName = (row: DatasetsPublicationListItem) => {
    if (row.hasErrors) return 'sh-row-error';
    if (row.status === IngestionStatus.LOADED && !row.isQueued) return 'sh-row-highlighted';
    return undefined;
  };
  return (
    <div className={styles.DatasetsPublicationTable}>
      <Table
        value={datasets}
        columns={columns}
        rowClassName={rowClassName}
        columnClassName={styles.TableColumn}
        emptyMessage={t(isSearch ? 'datasets.list.empty_search_message' : 'datasets.list.empty_message')}
        defaultSortField="updated_at"
        defaultSortOrder={-1}
        dataKey="name"
      />
    </div>
  );
}
