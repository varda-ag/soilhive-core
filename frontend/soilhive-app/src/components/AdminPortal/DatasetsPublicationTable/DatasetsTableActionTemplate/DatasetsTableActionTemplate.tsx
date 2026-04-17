import { useTranslation } from 'react-i18next';

import CheckCircleIcon from 'assets/icons/small-check-circle-icon.svg?react';
import EditIcon from 'assets/icons/edit-icon.svg?react';
import TrashIcon from 'assets/icons/trash-icon.svg?react';
import { Button } from 'components/UI';
import { IngestionStatus } from 'types/backend';
import type { DatasetsPublicationListItem } from 'types/datasetsPublication';

import styles from './DatasetsTableActionTemplate.module.scss';

interface Props {
  dataset: DatasetsPublicationListItem;
  onEdit: (id: string) => void;
  onDelete: (dataset: DatasetsPublicationListItem) => void;
  onPublish: (id: string) => void;
}

export function DatasetsTableActionTemplate({ dataset, onEdit, onDelete, onPublish }: Props) {
  const { t } = useTranslation('admin');

  return (
    <div className={styles.TableActions}>
      {dataset.status === IngestionStatus.LOADED && (
        <Button type="secondary" size="tiny" onClick={() => onPublish(dataset.id)}>
          <CheckCircleIcon /> {t('datasets.list.publish_button_text')}
        </Button>
      )}
      {[IngestionStatus.PENDING, IngestionStatus.PUBLISHED].includes(dataset.status) && (
        <EditIcon data-testid="sh-dataset-edit" className={styles.TableActionIcon} onClick={() => onEdit(dataset.id)} role="button" />
      )}
      {[IngestionStatus.PENDING, IngestionStatus.LOADED, IngestionStatus.PUBLISHED].includes(dataset.status) && (
        <TrashIcon data-testid="sh-dataset-delete" className={styles.TableActionIcon} onClick={() => onDelete(dataset)} role="button" />
      )}
    </div>
  );
}
