import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnSortEvent } from 'primereact/column';
import WarningIcon from 'assets/icons/warning-icon.svg?react';
import { DatasetsTableStatusTemplate } from './DatasetsTableStatusTemplate/DatasetsTableStatusTemplate';
import { DatasetsTableVisibilityTemplate } from './DatasetsTableVisibilityTemplate/DatasetsTableVisibilityTemplate';
import { DatasetsTableActionTemplate } from './DatasetsTableActionTemplate/DatasetsTableActionTemplate';
import { Table } from 'components/UI/Table/Table';
import { IngestionStatus } from 'types/backend';
import type { TableColumn } from 'types/components';
import type { DatasetsPublicationListItem } from 'types/datasetsPublication';
import { dateStringToDDMMYYYY } from '../../../utilities/date';

import styles from './DatasetsPublicationTable.module.scss';

const statusSortingMap = {
  [IngestionStatus.PENDING]: 0,
  [IngestionStatus.ONGOING]: 1,
  [IngestionStatus.STAGED]: 2,
  [IngestionStatus.LOADED]: 3,
  [IngestionStatus.PUBLISHED]: 4,
};

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
      const valA = statusSortingMap[a.status] ?? 0;
      const valB = statusSortingMap[b.status] ?? 0;
      return (event.order || 0) * (valA - valB);
    });
  }, []);

  const nameBodyTemplate = useCallback(
    (dataset: DatasetsPublicationListItem) => (
      <span className={styles.NameCell}>
        {dataset.hasErrors && <WarningIcon className={styles.NameWarningIcon} />}
        {dataset.name}
      </span>
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
        bodyTemplate: ({ updated_at }: { updated_at: Date | null }) => dateStringToDDMMYYYY(updated_at),
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
    if (row.status === IngestionStatus.LOADED) return 'sh-row-highlighted';
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
        defaultSortField="name"
        defaultSortOrder={1}
        dataKey="name"
      />
    </div>
  );
}
