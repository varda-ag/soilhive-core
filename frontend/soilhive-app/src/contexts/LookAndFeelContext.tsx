import React, { createContext, useState, type ReactNode, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { REST_END_POINTS } from '../configuration/api';
import { queryClient } from '../App';
import { useApiMutation } from 'hooks/useApiMutation';
import useTheme from 'hooks/useTheme';
import useNotifications from 'hooks/useNotifications';
import type { ThemeColors } from 'types/config';

type LookAndFeelContextType = {
  isLoading: boolean;
  logo: string | null;
  previewLogo: string | null;
  isActualLogo: boolean;
  colors: ThemeColors;
  defaultColors: ThemeColors | undefined;
  handleLogoChange: (file: File) => void;
  saveLogo: () => void;
  deleteLogo: () => void;
  handleColorChange: (name: string, value: string) => void;
  handleDefaultColorsSave: () => void;
  restoreDefaultColors: () => void;
  resetChanges: () => void;
  saveChanges: () => void;
};

export const LookAndFeelContext = createContext<LookAndFeelContextType | undefined>(undefined);

type LookAndFeelProps = {
  children: ReactNode;
};

export const LookAndFeelProvider: React.FC<LookAndFeelProps> = ({ children }) => {
  const { t } = useTranslation('admin');
  const { isLogoLoading, logo, themeConfig, setLogo, saveColors, saveDefaultColors } = useTheme();
  const { showNotification } = useNotifications();

  const [previewLogo, setPreviewLogo] = useState<string | null>(logo);
  const previewUrlRef = useRef<string | null>(null);
  const previewFileRef = useRef<File | null>(null);

  const [colors, setColors] = useState<ThemeColors>({});
  const [colorsChanged, setColorsChanged] = useState<boolean>(false);

  const saveLogoMutation = useApiMutation<{ formData: FormData }, unknown>({
    endpoint: `/${REST_END_POINTS.LOGO}`,
    method: 'POST',
  });

  const deleteLogoMutation = useApiMutation<null, unknown>({
    endpoint: `/${REST_END_POINTS.LOGO}`,
    method: 'DELETE',
  });

  const isActualLogo = useMemo((): boolean => previewLogo === logo, [logo, previewLogo]);

  const clearLogoRefs = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = null;
    previewFileRef.current = null;
  }, []);

  const resetChanges = useCallback(() => {
    setPreviewLogo(logo);
    clearLogoRefs();
  }, [logo, clearLogoRefs]);

  const saveLogo = useCallback(async () => {
    if (!previewFileRef.current) return;

    const formData = new FormData();
    formData.append('file', previewFileRef.current);

    await saveLogoMutation.mutateAsync(formData);
    await queryClient.invalidateQueries({ queryKey: [`${REST_END_POINTS.LOGO}`] });
  }, [saveLogoMutation]);

  const handleLogoChange = useCallback((file: File) => {
    previewFileRef.current = file;

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    previewUrlRef.current = nextPreviewUrl;
    setPreviewLogo(nextPreviewUrl);
  }, []);

  const deleteLogo = useCallback(() => {
    setPreviewLogo(null);
    clearLogoRefs();
  }, [clearLogoRefs]);

  const saveChanges = useCallback(async () => {
    if (!previewLogo && logo) {
      await deleteLogoMutation.mutateAsync(null);
      setLogo(null);
    }

    if (previewFileRef.current) {
      await saveLogo();
    }

    if (colorsChanged) {
      await saveColors(colors);
      setColorsChanged(false);
    }

    showNotification({
      id: 'lookAndFeelSuccess',
      title: t('look_and_feel.publish_notification.title'),
      message: t('look_and_feel.publish_notification.message'),
      type: 'success',
    });
  }, [previewLogo, logo, colorsChanged, showNotification, t, deleteLogoMutation, setLogo, saveLogo, saveColors, colors]);

  const handleColorChange = useCallback(
    (name: string, value: string) => {
      if (!colorsChanged) {
        setColorsChanged(true);
      }

      setColors(prevValue => {
        return { ...prevValue, [name]: value };
      });
    },
    [colorsChanged],
  );

  const defaultColors = useMemo(() => themeConfig.defaultColors, [themeConfig]);

  const handleDefaultColorsSave = useCallback(async () => {
    await saveDefaultColors(colors);

    showNotification({
      id: 'defaultColorsSuccess',
      title: t('look_and_feel.default_colors_notification.title'),
      message: t('look_and_feel.default_colors_notification.message'),
      type: 'success',
    });
  }, [colors, saveDefaultColors, showNotification, t]);

  const restoreDefaultColors = useCallback(() => {
    if (defaultColors) {
      setColors({ ...defaultColors });
      setColorsChanged(true);
    }
  }, [defaultColors]);

  useEffect(() => {
    setPreviewLogo(logo);
  }, [logo]);

  useEffect(() => {
    if (themeConfig.colors) {
      setColors({ ...themeConfig.colors });
    }
  }, [themeConfig.colors]);

  return (
    <LookAndFeelContext.Provider
      value={{
        isLoading: isLogoLoading,
        logo,
        previewLogo,
        isActualLogo,
        colors,
        defaultColors,
        saveLogo,
        handleLogoChange,
        deleteLogo,
        handleColorChange,
        handleDefaultColorsSave,
        restoreDefaultColors,
        resetChanges,
        saveChanges,
      }}
    >
      {children}
    </LookAndFeelContext.Provider>
  );
};
