import { useTranslation } from 'react-i18next';

export function MapSettings() {
  const { t } = useTranslation('admin');
  return <h2>{t('map_settings.title')}</h2>;
}
