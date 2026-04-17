import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, TextArea } from 'components/UI';
import useNotifications from 'hooks/useNotifications';
import { useMetadataMutation } from 'hooks/useMetadataMutation';
import styles from './Metadata.module.scss';

export default function Metadata() {
  const { t } = useTranslation('admin');
  const [value, setValue] = useState('');
  const { mutateAsync, isPending } = useMetadataMutation();
  const { showNotification } = useNotifications();

  const handleSave = async () => {
    try {
      await mutateAsync({ value });
      showNotification({
        id: 'metadata-save-success',
        title: t('metadata.notification.success.title'),
        message: t('metadata.notification.success.message'),
        type: 'success',
      });
    } catch {
      showNotification({
        id: 'metadata-save-error',
        title: t('metadata.notification.error.title'),
        message: t('metadata.notification.error.message'),
        type: 'error',
      });
    }
  };

  return (
    <div className={styles.Page}>
      <h1 className={styles.Title}>{t('metadata.title')}</h1>
      <div className={styles.Form}>
        <TextArea label={t('metadata.label')} placeholder={t('metadata.placeholder')} value={value} rows={6} onChange={setValue} />
        <div className={styles.Actions}>
          <Button onClick={handleSave} isDisabled={isPending}>
            {isPending ? t('metadata.saving') : t('metadata.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
