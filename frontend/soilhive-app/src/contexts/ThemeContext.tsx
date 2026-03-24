import React, { createContext, useState, useEffect, type ReactNode, useCallback } from 'react';
import { useRequest } from '../api-client';
import { BACKEND_BASE_URL, REST_END_POINTS } from '../configuration/api';
import { useConfig } from '../hooks/useConfig';

type Theme = Record<string, string>;

type ThemeContextType = {
  theme: Theme | null;
  logo: string | null;
  handleColorChange: (name: string, value: string) => void;
  handleLogoChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  saveThemeConfig: (newConfig: unknown) => Promise<void>;
  deleteLogo: () => void;
};

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

type ThemeProviderProps = {
  children: ReactNode;
};

const defaultTheme: Theme = {
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
  const [theme, setTheme] = useState<Theme | null>(null);
  const [logo, setLogo] = useState<string | null>(null);

  const { request, loading } = useRequest();

  const handleColorChange = useCallback(
    (name: string, value: string) => {
      setTheme({
        ...theme,
        [name]: value,
      });
    },
    [theme],
  );

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

  const {
    isLoading,
    config: frontendThemeConfig,
    saveConfig: saveThemeConfig,
  } = useConfig<Record<string, string>>('frontend_theme', defaultTheme);

  useEffect(() => {
    if (loading || isLoading || !frontendThemeConfig) return;

    setTheme(frontendThemeConfig);

    const root = document.documentElement;
    Object.entries(frontendThemeConfig).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
    });
  }, [theme, loading, isLoading, frontendThemeConfig]);

  useEffect(() => {
    if (!logo) {
      fetchLogo();
    }
  }, [logo, fetchLogo]);

  return (
    <ThemeContext.Provider value={{ theme, logo, handleColorChange, saveThemeConfig, handleLogoChange, deleteLogo }}>
      {children}
    </ThemeContext.Provider>
  );
};
