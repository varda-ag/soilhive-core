import React, { createContext, useState, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import useConfig from '../hooks/useConfig';
import { REST_END_POINTS } from '../configuration/api';
import type { ThemeColors, ThemeConfig } from '../types/config';
import useNotifications from 'hooks/useNotifications';
import { useApiQuery } from '../hooks/useApiQuery';
import { defaultColors } from '../configuration/colors';

type ThemeContextType = {
  themeConfig: ThemeConfig;
  logo: string | null;
  isLogoLoading: boolean;
  setLogo: React.Dispatch<React.SetStateAction<string | null>>;
  isLoadingThemeConfig: boolean;
  saveColors: (colors: ThemeColors) => Promise<void>;
  saveInitialBbox: (initialBbox: number[]) => Promise<void>;
  saveTermsAndConditions: (termsAndConditionsHtml: string) => Promise<void>;
  savePrivacyPolicy: (privacyPolicyHtml: string) => Promise<void>;
  saveNotificationBanner: (notificationBannerHtml: string) => Promise<void>;
};

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

type ThemeProviderProps = {
  children: ReactNode;
};

export const defaultThemeConfig: ThemeConfig = {
  colors: defaultColors,
  termsAndConditionsHtml: '',
  termsAndConditionsLatestUpdate: '',
  privacyPolicyHtml: '',
  privacyPolicyLatestUpdate: '',
  notificationBannerHtml: '',
  initialBbox: [6.6272658, 35.2889616, 18.7844746, 47.0921462],
};

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const { t } = useTranslation('admin');
  const { showNotification } = useNotifications();
  const { isLoading: isLoadingThemeConfig, config: themeConfig, saveConfig } = useConfig<ThemeConfig>('theme', defaultThemeConfig);

  const saveColors = async (colors: ThemeColors) => {
    await saveConfig({
      ...themeConfig,
      colors,
    });
  };

  const saveInitialBbox = async (initialBbox: number[]) => {
    await saveConfig({
      ...themeConfig,
      initialBbox,
    });

    showNotification({
      id: 'saveInitialBboxSuccess',
      title: t('map_settings.notification.title'),
      message: t('map_settings.notification.message'),
      type: 'success',
    });
  };

  const saveTermsAndConditions = async (termsAndConditionsHtml: string) => {
    const latestUpdate = new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    await saveConfig({
      ...themeConfig,
      termsAndConditionsHtml,
      termsAndConditionsLatestUpdate: latestUpdate,
    });

    showNotification({
      id: 'saveTermsAndConditionsSuccess',
      title: t('terms_and_conditions.notification.title'),
      message: t('terms_and_conditions.notification.message'),
      type: 'success',
    });
  };

  const savePrivacyPolicy = async (privacyPolicyHtml: string) => {
    const latestUpdate = new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    await saveConfig({
      ...themeConfig,
      privacyPolicyHtml,
      privacyPolicyLatestUpdate: latestUpdate,
    });

    showNotification({
      id: 'savePrivacyPolicySuccess',
      title: t('privacy_policy.notification.title'),
      message: t('privacy_policy.notification.message'),
      type: 'success',
    });
  };

  const saveNotificationBanner = async (notificationBannerHtml: string) => {
    await saveConfig({
      ...themeConfig,
      notificationBannerHtml,
    });

    showNotification({
      id: 'saveNotificationBannerSuccess',
      title: t('notification_banner.notification.title'),
      message: t('notification_banner.notification.message'),
      type: 'success',
    });
  };

  const [logo, setLogo] = useState<string | null>(null);

  const { data: logoResponse, isLoading: isLogoLoading } = useApiQuery<Blob | MediaSource>({
    endpoint: `/${REST_END_POINTS.LOGO}`,
    method: 'GET',
    queryKey: [`${REST_END_POINTS.LOGO}`],
    enabled: true,
    showErrorNotification: false,
    notFoundAsNull: true,
    retry: false,
    isBlobResponse: true,
  });

  useEffect(() => {
    if (isLoadingThemeConfig || !themeConfig) return;

    const root = document.documentElement;
    Object.entries(themeConfig.colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
    });
  }, [isLoadingThemeConfig, themeConfig]);

  useEffect(() => {
    if (isLogoLoading || !logoResponse) return;

    const url = URL.createObjectURL(logoResponse);

    setLogo(url || null);
  }, [logoResponse, isLogoLoading]);

  return (
    <ThemeContext.Provider
      value={{
        themeConfig: themeConfig!,
        logo,
        saveColors,
        saveInitialBbox,
        saveTermsAndConditions,
        savePrivacyPolicy,
        saveNotificationBanner,
        setLogo,
        isLogoLoading,
        isLoadingThemeConfig,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};
