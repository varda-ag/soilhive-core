import { useTranslation } from 'react-i18next';

import useTheme from 'hooks/useTheme';
import termsAndConditionsImage from 'assets/images/terms-and-conditions.png';
import LegalPageTemplate from 'components/LegalPageTemplate/LegalPageTemplate';

export default function TermsOfUse() {
  const { t } = useTranslation('common');
  const { isLoadingThemeConfig, themeConfig } = useTheme();

  return (
    <LegalPageTemplate
      htmlContent={themeConfig.termsAndConditionsHtml}
      title={t('terms_of_use.title')}
      latestUpdate={themeConfig.termsAndConditionsLatestUpdate}
      bannerImage={termsAndConditionsImage}
      isLoading={isLoadingThemeConfig}
    />
  );
}
