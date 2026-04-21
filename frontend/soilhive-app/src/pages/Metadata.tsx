import { useState, useEffect } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button, TextArea } from 'components/UI';
import useNotifications from 'hooks/useNotifications';
import { useMetadataMutation } from 'hooks/useMetadataMutation';
import { useDataset } from 'hooks/useDatasets';
import styles from './Metadata.module.scss';
import SoilhiveSimpleMap from 'components/Map/SoilhiveSimpleMap';
import { BACKEND_BASE_URL } from '../utilities/environmentVariables';

export default function Metadata() {
  const { id } = useParams();
  const { t } = useTranslation('admin');
  const [value, setValue] = useState('');
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);
  const { data: dataset, isLoading, isError } = useDataset(id);
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
      <p>Dataset ID: {id}</p>
      <p>BACKEND_BASE_URL: {BACKEND_BASE_URL}</p>
      {isLoading && <p>Loading...</p>}
      {isError && <p>Failed to load dataset.</p>}
      {dataset && (
        <details>
          <summary>Dataset</summary>
          <pre>{JSON.stringify(dataset, null, 2)}</pre>
        </details>
      )}
      <div className="map" style={{width: '300px', height: '300px'}}>
        {isMounted && <SoilhiveSimpleMap />}
      </div>
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
