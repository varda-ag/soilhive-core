import { useTranslation } from 'react-i18next';

import useTheme from 'hooks/useTheme';
import privacyPolicyImage from 'assets/images/privacy-policy.png';
import LegalPageTemplate from 'components/LegalPageTemplate/LegalPageTemplate';

export default function PrivacyPolicy() {
  const { t } = useTranslation('common');
  const { isLoadingThemeConfig, themeConfig } = useTheme();

  return (
    <LegalPageTemplate
      htmlContent={themeConfig.privacyPolicyHtml}
      title={t('privacy_policy.title')}
      latestUpdate={themeConfig.privacyPolicyLatestUpdate}
      bannerImage={privacyPolicyImage}
      isLoading={isLoadingThemeConfig}
    />
  );
}
