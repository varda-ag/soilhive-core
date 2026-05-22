import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { Button } from 'components/UI';
import { useIngestionStatus } from 'hooks/useIngestionStatus';
import { ADMIN_PATHS } from '../../../configuration/admin';
import styles from './DatasetsPreviewStep.module.scss';

export function DatasetsPreviewStep() {
  const { t } = useTranslation('admin');
  const { id } = useParams();
  const navigate = useNavigate();
  const { isLoading: isIngestionLoading, updateFurthestStep } = useIngestionStatus();

  const hasTracked = useRef(false);
  useEffect(() => {
    if (!hasTracked.current && id && !isIngestionLoading) {
      hasTracked.current = true;
      updateFurthestStep(id, 'preview');
    }
  }, [id, isIngestionLoading, updateFurthestStep]);

  const handlePrevious = useCallback(() => {
    navigate(`${ADMIN_PATHS.DATASETS}/edit/${id}/mappings`);
  }, [navigate, id]);

  return (
    <div className={styles.DatasetsPreviewStep}>
      <h2>{t('datasets.preview.title')}</h2>
      <p>Dataset id: {id}</p>
      <Button type="secondary" onClick={handlePrevious} dataTestId="sh-preview-previous">
        {t('datasets.actions.previous')}
      </Button>
    </div>
  );
}
