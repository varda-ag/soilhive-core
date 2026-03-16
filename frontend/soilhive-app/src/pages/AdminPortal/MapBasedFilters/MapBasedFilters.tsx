import { useTranslation } from 'react-i18next';

export function MapBasedFilters() {
  const { t } = useTranslation('admin');
  return <h2>{t('filters.title')}</h2>;
}
