import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './DatasetsPreviewStep.module.scss';
import { useParams } from 'react-router';
import { useIngestionStatus } from 'hooks/useIngestionStatus';

export function DatasetsPreviewStep() {
  const { t } = useTranslation('admin');
  const { id } = useParams();
  const { isLoading: isIngestionLoading, updateFurthestStep } = useIngestionStatus();

  const hasTracked = useRef(false);
  useEffect(() => {
    if (!hasTracked.current && id && !isIngestionLoading) {
      hasTracked.current = true;
      updateFurthestStep(id, 'preview');
    }
  }, [id, isIngestionLoading, updateFurthestStep]);

  return (
    <div className={styles.DatasetsPreviewStep}>
      <h2>{t('datasets.preview.title')}</h2>
      <p>Dataset id: {id}</p>
    </div>
  );
}
