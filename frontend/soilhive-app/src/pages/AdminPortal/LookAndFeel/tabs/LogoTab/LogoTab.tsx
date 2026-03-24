import { useTranslation } from 'react-i18next';

export function LogoTab() {
  const { t } = useTranslation('admin');
  return <h2>{t('look_and_feel.title')} LOGO</h2>;
}
