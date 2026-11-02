import EditIcon from 'assets/icons/edit-icon.svg?react';
import TrashIcon from 'assets/icons/trash-icon.svg?react';
import { type RasterFilterCategory } from 'types/backend';

import styles from './MapBasedFiltersTableActionTemplate.module.scss';

interface Props {
  filter: RasterFilterCategory;
  onEdit: (id: string) => void;
  onDelete: (filter: RasterFilterCategory) => void;
}

export function MapBasedFiltersTableActionTemplate({ filter, onEdit, onDelete }: Props) {
  return (
    <div className={styles.TableActions}>
      {filter.enabled && (
        <>
          <EditIcon data-testid="sh-filter-edit" className={styles.TableActionIcon} onClick={() => onEdit(filter.id)} role="button" />
          <TrashIcon data-testid="sh-filter-delete" className={styles.TableActionIcon} onClick={() => onDelete(filter)} role="button" />
        </>
      )}
    </div>
  );
}
