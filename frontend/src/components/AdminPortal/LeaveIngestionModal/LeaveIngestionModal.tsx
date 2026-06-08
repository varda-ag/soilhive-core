import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import LeaveIngestionImage from 'assets/images/stop-sign-hand.svg?react';
import { Dialog } from 'components/UI';

import styles from './LeaveIngestionModal.module.scss';

interface Props {
  visible: boolean;
  onContinue: () => void;
  onCancel: () => void;
}

export function LeaveIngestionModal({ visible, onContinue, onCancel }: Props) {
  const { t } = useTranslation('admin');
  const { id } = useParams();

  return (
    <Dialog
      visible={visible}
      header={t('datasets.leave_ingestion_modal.title')}
      secondaryText={t('datasets.leave_ingestion_modal.confirm')}
      primaryText={t('datasets.leave_ingestion_modal.cancel')}
      className={styles.LeaveIngestionModal}
      contentClassName={styles.LeaveIngestionModalContent}
      onPrimary={onCancel}
      onSecondary={onContinue}
      onClose={onCancel}
    >
      <>
        <LeaveIngestionImage />
        <p>{t(`datasets.leave_ingestion_modal.${id ? 'message' : 'message_new_dataset'}`)}</p>
      </>
    </Dialog>
  );
}
