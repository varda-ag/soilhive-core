import { useTranslation } from 'react-i18next';
import styles from './DatasetsQualityCheckStep.module.scss';
import { useParams } from 'react-router';

export function DatasetsQualityCheckStep() {
  const { t } = useTranslation('admin');
  const { id } = useParams();

  return (
    <div className={styles.DatasetsQualityCheckStep}>
      <h2>{t('datasets.quality_check.title')}</h2>
      <p>Dataset id: {id}</p>
    </div>
  );
}
