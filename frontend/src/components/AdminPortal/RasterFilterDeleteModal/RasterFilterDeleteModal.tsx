import { Trans, useTranslation } from 'react-i18next';

import DeleteFilterImage from 'assets/images/trash-can-image.svg?react';
import { Dialog } from 'components/Dialog/Dialog';

import styles from './RasterFilterDeleteModal.module.scss';

interface Props {
  visible: boolean;
  filterName?: string;
  isDeleting?: boolean;
  onContinue: () => void;
  onCancel: () => void;
}

export function RasterFilterDeleteModal({ visible, filterName, isDeleting, onContinue, onCancel }: Props) {
  const { t } = useTranslation('admin');

  return (
    <Dialog
      visible={visible}
      header={t('filters.list.delete_modal.title')}
      secondaryText={t('filters.list.delete_modal.cancel')}
      primaryText={t('filters.list.delete_modal.confirm')}
      className={styles.RasterFilterDeleteModal}
      contentClassName={styles.RasterFilterDeleteModalContent}
      isLoading={isDeleting}
      onPrimary={onContinue}
      onSecondary={onCancel}
    >
      <>
        <DeleteFilterImage />
        <p>
          <Trans
            t={t}
            i18nKey="filters.list.delete_modal.message"
            components={{
              strong: <strong />,
            }}
            values={{ filterName }}
          />
        </p>
      </>
    </Dialog>
  );
}
