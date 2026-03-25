import { useTranslation } from 'react-i18next';

export function ColorsTab() {
  const { t } = useTranslation('admin');
  return <h2>{t('look_and_feel.title')} COLORS</h2>;
}
