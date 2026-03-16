import { useTranslation } from 'react-i18next';

export function DatasetsPublication() {
  const { t } = useTranslation('admin');
  return <h2>{t('datasets.title')}</h2>;
}
