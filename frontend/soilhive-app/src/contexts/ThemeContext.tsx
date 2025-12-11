import React, { createContext, useState, useEffect, type ReactNode, useCallback } from 'react';
import { useRequest } from '../api-client';
import { BACKEND_BASE_URL, REST_END_POINTS } from '../configuration/api';

type Theme = Record<string, string>;

type ThemeContextType = {
  theme: Theme | null;
  logo: string | null;
  handleColorChange: (name: string, value: string) => void;
  handleLogoChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  saveThemeConfig: () => void;
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

const THEME_ID = 'frontend_theme';

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

  const saveLogo = useCallback(async (selectedFile: File) => {
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
  }, []);

  const handleLogoChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];

    if (selectedFile) {
      const url = URL.createObjectURL(selectedFile);
      setLogo(url);
      saveLogo(selectedFile);
    }
  }, []);

  const saveThemeConfig = useCallback(async () => {
    try {
      await request({
        url: `${BACKEND_BASE_URL}/${REST_END_POINTS.CONFIG.replace(':id', THEME_ID)}`,
        method: 'PUT',
        body: theme,
      });
    } catch (e) {
      console.error('save config error', e);
    }
  }, [theme]);

  const fetchTheme = useCallback(async () => {
    try {
      const response = await request({
        url: `${BACKEND_BASE_URL}/${REST_END_POINTS.CONFIG.replace(':id', THEME_ID)}`,
      });

      return response;
    } catch (e) {
      console.error('get theme error', e);
    }
  }, []);

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
  }, []);

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
  }, []);

  useEffect(() => {
    if (loading) return;

    async function loadTheme() {
      const fetchedTheme = await fetchTheme();
      setTheme(fetchedTheme || defaultTheme);
    }

    if (!theme) {
      loadTheme();
    } else {
      const root = document.documentElement;
      Object.entries(theme).forEach(([key, value]) => {
        root.style.setProperty(`--color-${key}`, value);
      });
    }
  }, [fetchTheme, theme, loading]);

  useEffect(() => {
    if (!logo) {
      fetchLogo();
    }
  }, [logo]);

  return (
    <ThemeContext.Provider value={{ theme, logo, handleColorChange, saveThemeConfig, handleLogoChange, deleteLogo }}>
      {children}
    </ThemeContext.Provider>
  );
};
