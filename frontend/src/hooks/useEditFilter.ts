import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useRasterFilter } from './useRasterFilter';
import { useUpdateRasterFilterMutation, useUpdateRasterFilterMappingsMutation } from './useRasterFilterMutation';
import { useFilterForm } from './useFilterForm';
import { useFilterMappings } from './useFilterMappings';
import useNotifications from './useNotifications';
import { ADMIN_PATHS } from '../configuration/admin';
import { isInstallInProgress } from '../utilities/rasterFilter';
import { RasterFilterInstallStatus } from 'types/backend';

// Follows a created filter's install, then edits its name, description and labels
export function useEditFilter(filterId: string | undefined) {
  const { t } = useTranslation('admin');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showNotification } = useNotifications();
  const { formData, setFormData, handleChange, isFormValid, trimmedFormData } = useFilterForm();
  const formInitializedFor = useRef<string | null>(null);

  const { data, isFetchedAfterMount, isError } = useRasterFilter(filterId, { pollInstall: true });
  // Data cached from an earlier visit can predate the last save, and the form is filled only once
  const filter = isFetchedAfterMount ? data : undefined;
  const installStatus = filter?.install?.status;
  const isInstalled = installStatus === RasterFilterInstallStatus.INSTALLED;
  const isInstallFailed = installStatus === RasterFilterInstallStatus.FAILED;
  const isNotInstalled = installStatus === RasterFilterInstallStatus.NOT_INSTALLED;
  const isInstalling = !!installStatus && isInstallInProgress(installStatus);

  const { mutateAsync: updateFilter, isPending: isUpdatingFilter } = useUpdateRasterFilterMutation(filterId);
  const { mutateAsync: saveMappings, isPending: isSavingMappings } = useUpdateRasterFilterMappingsMutation(filterId);
  const isSaving = isUpdatingFilter || isSavingMappings;

  const { rows: mappingRows, mappings, handleLabelChange, clearLabel } = useFilterMappings(filter);

  // Filled once, so polling does not overwrite what the user types
  useEffect(() => {
    if (!filter || formInitializedFor.current === filter.id) return;
    formInitializedFor.current = filter.id;
    setFormData({ name: filter.name, description: filter.description });
  }, [filter, setFormData]);

  // The failed filter stays on the list, where it can be deleted before a new one is created
  useEffect(() => {
    if (!isInstallFailed || !filterId) return;
    showNotification({
      id: `createFilterFailed-${filterId}`,
      title: t('createFilter.install_failed.title'),
      message: t('createFilter.install_failed.message'),
      type: 'error',
    });
    queryClient.invalidateQueries({ queryKey: ['rasterFilters'] });
    navigate(ADMIN_PATHS.FILTERS, { replace: true });
  }, [isInstallFailed, filterId, showNotification, queryClient, navigate, t]);

  // The error itself is already notified globally, e.g. for a wrong filterId
  useEffect(() => {
    if (isError) navigate(ADMIN_PATHS.FILTERS, { replace: true });
  }, [isError, navigate]);

  // A filter created by the API is queued at once, so this one has nothing to label and is only reachable by URL
  useEffect(() => {
    if (isNotInstalled) navigate(ADMIN_PATHS.FILTERS, { replace: true });
  }, [isNotInstalled, navigate]);

  const isSaveEnabled = isInstalled && isFormValid && !isSaving;

  const handleSave = useCallback(async () => {
    if (!filter) return;
    const { name, description } = trimmedFormData();

    try {
      if (name !== filter.name || description !== filter.description) {
        await updateFilter({ name, description });
      }
      await saveMappings(mappings);
      await queryClient.invalidateQueries({ queryKey: ['rasterFilters'] });
      navigate(ADMIN_PATHS.FILTERS);
    } catch {
      // Already notified
    }
  }, [filter, trimmedFormData, mappings, updateFilter, saveMappings, queryClient, navigate]);

  return {
    filter,
    formData,
    isLoading: !isFetchedAfterMount,
    isInstalling,
    installProgress: filter?.install?.progress_percentage,
    isInstalled,
    isEnabled: !!filter?.enabled,
    mappingRows,
    isSaveEnabled,
    handleChange,
    handleLabelChange,
    clearLabel,
    handleSave,
  };
}
