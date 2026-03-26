import { useTranslation } from 'react-i18next';
import styles from './DatasetsSoilDataStep.module.scss';
import { useParams } from 'react-router';

export function DatasetsSoilDataStep() {
  const { t } = useTranslation('admin');
  const { id } = useParams();

  return (
    <div className={styles.DatasetsSoilDataStep}>
      <h2>{t('datasets.soil_data.title')}</h2>
      <p>Dataset id: {id}</p>
    </div>
  );
}
