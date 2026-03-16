import { useTranslation } from 'react-i18next';

export function TermsAndConditions() {
  const { t } = useTranslation('admin');
  return <h2>{t('terms_and_conditions.title')}</h2>;
}
