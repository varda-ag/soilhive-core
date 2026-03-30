import React, { createContext, useState, useEffect, type ReactNode, useCallback } from 'react';
import { useRequest } from '../api-client';
import useConfig from '../hooks/useConfig';
import { BACKEND_BASE_URL, REST_END_POINTS } from '../configuration/api';
import type { ThemeColors, ThemeConfig } from '../types/config';

type ThemeContextType = {
  themeConfig: ThemeConfig;
  logo: string | null;
  handleLogoChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  deleteLogo: () => void;
  isLoadingThemeConfig: boolean;
  saveColors: (colors: ThemeColors) => Promise<void>;
  saveInitialBbox: (initialBbox: number[]) => Promise<void>;
  saveTermsAndConditions: (termsAndConditionsHtml: string) => Promise<void>;
};

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

type ThemeProviderProps = {
  children: ReactNode;
};

const defaultColors: ThemeColors = {
  primary: '#3498db',
  'primary-hover': '#3498db',
  'primary-active': '#3498db',
  'primary-disabled': '#3498db',
  secondary: '#3498db',
  'secondary-hover': '#3498db',
  'secondary-active': '#3498db',
  'secondary-disabled': '#3498db',
};

const defaultThemeConfig: ThemeConfig = {
  colors: defaultColors,
  termsAndConditionsHtml: '',
  initialBbox: [6.6272658, 35.2889616, 18.7844746, 47.0921462],
};

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
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
  };

  const saveTermsAndConditions = async (termsAndConditionsHtml: string) => {
    await saveConfig({
      ...themeConfig,
      termsAndConditionsHtml,
    });
  };

  const [logo, setLogo] = useState<string | null>(null);

  const { request, loading } = useRequest();

  const saveLogo = useCallback(
    async (selectedFile: File) => {
      if (!selectedFile) return;

      const formData = new FormData();
      formData.append('file', selectedFile);

      try {
        await request({
          url: `${BACKEND_BASE_URL}/${REST_END_POINTS.LOGO}`,
          method: 'POST',
          body: formData,
        });
      } catch (e) {
        console.error('logo save error', e);
      }
    },
    [request],
  );

  const handleLogoChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = event.target.files?.[0];

      if (selectedFile) {
        const url = URL.createObjectURL(selectedFile);
        setLogo(url);
        saveLogo(selectedFile);
      }
    },
    [saveLogo],
  );

  const fetchLogo = useCallback(async () => {
    try {
      const response = await request({
        url: `${BACKEND_BASE_URL}/${REST_END_POINTS.LOGO}`,
        isBlobResponse: true,
      });

      const url = URL.createObjectURL(response);
      setLogo(url || null);
    } catch (e) {
      console.error('get logo error', e);
    }
  }, [request]);

  const deleteLogo = useCallback(async () => {
    try {
      await request({
        url: `${BACKEND_BASE_URL}/${REST_END_POINTS.LOGO}`,
        method: 'DELETE',
      });

      fetchLogo();
    } catch (e) {
      console.error('delete logo error', e);
    }
  }, [fetchLogo, request]);

  useEffect(() => {
    if (loading || isLoadingThemeConfig || !themeConfig) return;

    const root = document.documentElement;
    Object.entries(themeConfig.colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
    });
  }, [themeConfig, loading, isLoadingThemeConfig]);

  useEffect(() => {
    if (!logo) {
      fetchLogo();
    }
  }, [logo, fetchLogo]);

  return (
    <ThemeContext.Provider
      value={{
        themeConfig: themeConfig!,
        logo,
        saveColors,
        saveInitialBbox,
        saveTermsAndConditions,
        handleLogoChange,
        deleteLogo,
        isLoadingThemeConfig,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};
