import { useTranslation } from 'react-i18next';

export default function Legal() {
  const { t } = useTranslation('common');
  return (
    <>
      <h2>{t('legal_page.title')}</h2>
      <div></div>
    </>
  );
}
