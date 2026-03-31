import React, { createContext, useState, useEffect, type ReactNode, useCallback } from 'react';
import useConfig from 'hooks/useConfig';
import { useApiQuery } from 'hooks/useApiQuery';
import { REST_END_POINTS } from '../configuration/api';
import type { TermsAndConditionsConfig, ThemeConfig } from '../types/config';

type ThemeContextType = {
  theme: ThemeConfig | null;
  logo: string | null;
  handleColorChange: (name: string, value: string) => void;
  saveThemeConfig: (newConfig: ThemeConfig) => Promise<void>;
  isLoadingTermsAndConditions: boolean;
  isLogoLoading: boolean;
  termsAndConditionsHtml: string;
  saveTermsAndConditions: (newConfig: string) => Promise<void>;
  setLogo: React.Dispatch<React.SetStateAction<string | null>>;
};

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

type ThemeProviderProps = {
  children: ReactNode;
};

const defaultTheme: ThemeConfig = {
  primary: '#3498db',
  'primary-hover': '#3498db',
  'primary-active': '#3498db',
  'primary-disabled': '#3498db',
  secondary: '#3498db',
  'secondary-hover': '#3498db',
  'secondary-active': '#3498db',
  'secondary-disabled': '#3498db',
};

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const {
    isLoading: isLoadingTermsAndConditions,
    config: termsAndConditionsConfig,
    saveConfig,
  } = useConfig<TermsAndConditionsConfig>('terms_and_conditions', { html: '' });

  const saveTermsAndConditions = async (html: string) => {
    await saveConfig({ html });
  };

  const [theme, setTheme] = useState<ThemeConfig | null>(null);
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

  const handleColorChange = useCallback(
    (name: string, value: string) => {
      setTheme({
        ...theme,
        [name]: value,
      });
    },
    [theme],
  );

  const { isLoading, config: frontendThemeConfig, saveConfig: saveThemeConfig } = useConfig<ThemeConfig>('frontend_theme', defaultTheme);

  useEffect(() => {
    if (isLoading || !frontendThemeConfig) return;

    setTheme(frontendThemeConfig);

    const root = document.documentElement;
    Object.entries(frontendThemeConfig).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
    });
  }, [theme, isLoading, frontendThemeConfig]);

  useEffect(() => {
    if (isLogoLoading || !logoResponse) return;

    const url = URL.createObjectURL(logoResponse);

    setLogo(url || null);
  }, [logoResponse, isLogoLoading]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        logo,
        handleColorChange,
        saveThemeConfig,
        setLogo,
        isLogoLoading,
        isLoadingTermsAndConditions,
        termsAndConditionsHtml: termsAndConditionsConfig!['html'], // Default makes this defined
        saveTermsAndConditions,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};
