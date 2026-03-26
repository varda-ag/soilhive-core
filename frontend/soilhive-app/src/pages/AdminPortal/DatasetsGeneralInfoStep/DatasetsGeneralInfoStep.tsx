import { useTranslation } from 'react-i18next';
import styles from './DatasetsGeneralInfoStep.module.scss';
import { useParams } from 'react-router';

export function DatasetsGeneralInfoStep() {
  const { t } = useTranslation('admin');
  const { id } = useParams();

  return (
    <div className={styles.DatasetsGeneralInfoStep}>
      <h2>{t('datasets.general_info.title')}</h2>
      <p>Dataset id: {id}</p>
    </div>
  );
}
