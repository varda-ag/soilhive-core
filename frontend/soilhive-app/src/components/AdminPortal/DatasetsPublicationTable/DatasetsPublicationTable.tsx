import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnSortEvent } from 'primereact/column';

import { DatasetsTableStatusTemplate } from './DatasetsTableStatusTemplate/DatasetsTableStatusTemplate';
import { DatasetsTableVisibilityTemplate } from './DatasetsTableVisibilityTemplate/DatasetsTableVisibilityTemplate';
import { DatasetsTableActionTemplate } from './DatasetsTableActionTemplate/DatasetsTableActionTemplate';
import { Table } from 'components/UI/Table/Table';
import { IngestionStatus } from 'types/backend';
import type { TableColumn } from 'types/components';
import type { DatasetsPublicationListItem } from 'types/datasetsPublication';

import styles from './DatasetsPublicationTable.module.scss';

const statusSortingMap = {
  [IngestionStatus.PENDING]: 0,
  [IngestionStatus.ONGOING]: 1,
  [IngestionStatus.LOADED]: 2,
  [IngestionStatus.PUBLISHED]: 3,
};

interface Props {
  datasets: DatasetsPublicationListItem[];
  onEdit: (id: string) => void;
  onDelete: (dataset: DatasetsPublicationListItem) => void;
  onPublish: (id: string) => void;
}

export function DatasetsPublicationTable({ datasets, onEdit, onDelete, onPublish }: Props) {
  const { t } = useTranslation('admin');

  const statusSortFunction = useCallback((event: ColumnSortEvent) => {
    return [...event.data].sort((a: DatasetsPublicationListItem, b: DatasetsPublicationListItem) => {
      const valA = statusSortingMap[a.status] ?? 0;
      const valB = statusSortingMap[b.status] ?? 0;
      return (event.order || 0) * (valA - valB);
    });
  }, []);

  const actionsBodyTemplate = useCallback(
    (dataset: DatasetsPublicationListItem) => (
      <DatasetsTableActionTemplate dataset={dataset} onEdit={onEdit} onDelete={onDelete} onPublish={onPublish} />
    ),
    [onDelete, onEdit, onPublish],
  );

  const columns: TableColumn<DatasetsPublicationListItem>[] = useMemo(
    () => [
      { name: t('datasets.list.columns.name'), value: 'name', sortable: true },
      {
        name: t('datasets.list.columns.status'),
        value: 'status',
        sortable: true,
        bodyTemplate: DatasetsTableStatusTemplate,
        sortFunction: statusSortFunction,
      },
      { name: t('datasets.list.columns.visibility'), value: 'visibility', sortable: true, bodyTemplate: DatasetsTableVisibilityTemplate },
      {
        name: t('datasets.list.columns.actions'),
        value: 'actions',
        sortable: false,
        bodyTemplate: actionsBodyTemplate,
      },
    ],
    [t, actionsBodyTemplate, statusSortFunction],
  );

  const rowClassName = (row: DatasetsPublicationListItem) => {
    return row.status === IngestionStatus.LOADED ? styles.TableRowHighlighted : undefined;
  };

  return (
    <div className={styles.DatasetsPublicationTable}>
      <Table
        value={datasets}
        columns={columns}
        rowClassName={rowClassName}
        columnClassName={styles.TableColumn}
        emptyMessage={t('datasets.list.empty_message')}
      />
    </div>
  );
}
