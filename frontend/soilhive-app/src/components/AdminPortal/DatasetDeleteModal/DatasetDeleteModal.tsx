import { Trans, useTranslation } from 'react-i18next';

import DeleteDatasetImage from 'assets/images/trash-can-image.svg?react';
import { Dialog } from 'components/UI';

import styles from './DatasetDeleteModal.module.scss';

interface Props {
  visible: boolean;
  datasetName?: string;
  onContinue: () => void;
  onCancel: () => void;
}

export function DatasetDeleteModal({ visible, datasetName, onContinue, onCancel }: Props) {
  const { t } = useTranslation('admin');

  return (
    <Dialog
      visible={visible}
      header={t('datasets.list.delete_modal.title')}
      cancelText={t('datasets.list.delete_modal.cancel')}
      continueText={t('datasets.list.delete_modal.confirm')}
      className={styles.DatasetDeleteModal}
      contentClassName={styles.DatasetDeleteModalContent}
      onContinue={onContinue}
      onCancel={onCancel}
    >
      <>
        <DeleteDatasetImage />
        <p>
          <Trans
            t={t}
            i18nKey="datasets.list.delete_modal.message"
            components={{
              strong: <strong />,
            }}
            values={{ datasetName }}
          />
        </p>
      </>
    </Dialog>
  );
}
