import React, { createContext, useState, type ReactNode, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { REST_END_POINTS } from '../configuration/api';
import { queryClient } from '../App';
import { useApiMutation } from 'hooks/useApiMutation';
import useTheme from 'hooks/useTheme';
import useNotifications from 'hooks/useNotifications';

type LookAndFeelContextType = {
  isLoading: boolean;
  logo: string | null;
  previewLogo: string | null;
  isActualLogo: boolean;
  handleLogoChange: (file: File) => void;
  saveLogo: () => void;
  deleteLogo: () => void;
  resetChanges: () => void;
  saveChanges: () => void;
};

export const LookAndFeelContext = createContext<LookAndFeelContextType | undefined>(undefined);

type LookAndFeelProps = {
  children: ReactNode;
};

export const LookAndFeelProvider: React.FC<LookAndFeelProps> = ({ children }) => {
  const { t } = useTranslation('admin');
  const { isLogoLoading, logo, setLogo } = useTheme();
  const { showNotification } = useNotifications();

  const [previewLogo, setPreviewLogo] = useState<string | null>(logo);
  const previewUrlRef = useRef<string | null>(null);
  const previewFileRef = useRef<File | null>(null);

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

    showNotification({
      id: 'lookAndFeelSuccess',
      title: t('look_and_feel.publish_notification.title'),
      message: t('look_and_feel.publish_notification.message'),
      type: 'success',
    });
  }, [deleteLogoMutation, saveLogo, setLogo, previewLogo, logo, t, showNotification]);

  useEffect(() => {
    setPreviewLogo(logo);
  }, [logo]);

  return (
    <LookAndFeelContext.Provider
      value={{
        isLoading: isLogoLoading,
        logo,
        previewLogo,
        isActualLogo,
        saveLogo,
        handleLogoChange,
        deleteLogo,
        resetChanges,
        saveChanges,
      }}
    >
      {children}
    </LookAndFeelContext.Provider>
  );
};
