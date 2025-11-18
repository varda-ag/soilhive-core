import React, { createContext, useState, useEffect, type ReactNode, useCallback } from 'react';
import { useRequest } from '../api-client';

type Theme = Record<string, string>;

type ThemeContextType = {
  theme: Theme | null;
  logo: string | null;
  handleChange: (name: string, value: string) => void;
  handleLogoChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  saveThemeConfig: () => void;
};

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

type ThemeProviderProps = {
  children: ReactNode;
};

const defaultTheme: Theme = {
    'primary': '#3498db',
    'primary-hover': '#3498db',
    'primary-active': '#3498db',
    'primary-disabled': '#3498db',
    'secondary': '#3498db',
    'secondary-hover': '#3498db',
    'secondary-active': '#3498db',
    'secondary-disabled': '#3498db',
};

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [theme, setTheme] = useState<Theme | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  // const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const { request, loading, error } = useRequest();

  const handleChange = useCallback((name: string, value: string) => {
    setTheme({
        ...theme,
        [name]: value
    })
  }, [theme]);

  const handleLogoChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      const url = URL.createObjectURL(selectedFile);
      setLogo(url);
    }
  }, []);

    const saveThemeConfig = useCallback(async () => {
        try {
            const response = await request(
                {
                  url: 'http://localhost:4001/config/testId',
                    method: 'PUT',
                    body: theme,
                },
            );
            console.log(response)
        } catch (e) {
            console.log('pur error', e);
        }
    }, [theme]);

    const fetchTheme = useCallback(async () => {
      try {
          const response = await request({
            url: 'http://localhost:4001/config/testId'
          });
          console.log(response)

          return response;
      } catch (e) {
          console.log('error', e);
      }
    }, [])

  useEffect(() => {
    if (loading) {
      return;
    }
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

  return (
    <ThemeContext.Provider value={{ theme, logo, handleChange, saveThemeConfig, handleLogoChange }}>
      {children}
    </ThemeContext.Provider>
  );
};
