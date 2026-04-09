import { useTranslation } from 'react-i18next';
import styles from './DatasetsPreviewStep.module.scss';
import { useParams } from 'react-router';

export function DatasetsPreviewStep() {
  const { t } = useTranslation('admin');
  const { id } = useParams();

  return (
    <div className={styles.DatasetsPreviewStep}>
      <h2>{t('datasets.preview.title')}</h2>
      <p>Dataset id: {id}</p>
    </div>
  );
}
