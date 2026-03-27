import { useTranslation } from 'react-i18next';
import styles from './DatasetsMappingsStep.module.scss';
import { useParams } from 'react-router';

export function DatasetsMappingsStep() {
  const { t } = useTranslation('admin');
  const { id } = useParams();

  return (
    <div className={styles.DatasetsMappingsStep}>
      <h2>{t('datasets.mappings.title')}</h2>
      <p>Dataset id: {id}</p>
    </div>
  );
}
