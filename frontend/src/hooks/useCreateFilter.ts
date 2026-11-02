import { useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useApiQuery } from './useApiQuery';
import { useCreateRasterFilterMutation } from './useRasterFilterMutation';
import { useUpdateFileCrsMutation } from './useFileMutation';
import { useFileUpload } from './useFileUpload';
import { useFileManagement } from './useFileManagement';
import { useFilterForm } from './useFilterForm';
import { epsgCode } from '../utilities/crs';
import { ADMIN_PATHS } from '../configuration/admin';
import type { SoilDataFile } from '../types/soilDataFile';

export const FILTER_ALLOWED_EXTENSIONS = ['.tif', '.tiff'];

// Creates the filter from an uploaded raster; its install and labels are followed on the edit page
export function useCreateFilter() {
  const { t } = useTranslation('admin');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { deleteFile } = useFileManagement();
  const { formData, handleChange, isFormValid, trimmedFormData } = useFilterForm();

  const [filterFile, setFilterFile] = useState<SoilDataFile | null>(null);
  // Mirrors filterFile so a new upload can delete the file it replaces
  const filterFileRef = useRef<SoilDataFile | null>(null);
  const latestCrsSelection = useRef(0);

  const { mutateAsync: saveFileCrs } = useUpdateFileCrsMutation(filterFile?.id);
  const { mutateAsync: createFilter, isPending: isCreating } = useCreateRasterFilterMutation();

  const { data: crsOptions = [] } = useApiQuery<{ code: number; name: string }[]>({
    endpoint: '/epsg',
    method: 'GET',
    queryKey: ['epsg'],
    enabled: true,
  });

  const setFile = useCallback((file: SoilDataFile | null) => {
    filterFileRef.current = file;
    setFilterFile(file);
  }, []);

  const updateFilterFile = useCallback((updates: Partial<SoilDataFile>) => {
    setFilterFile(prev => {
      const updated = prev ? { ...prev, ...updates } : prev;
      filterFileRef.current = updated;
      return updated;
    });
  }, []);

  // Only one file is kept: a new upload replaces the previous one
  const onFileUploaded = useCallback(
    async (uploaded: SoilDataFile) => {
      const previous = filterFileRef.current;
      setFile(uploaded);
      if (previous) await deleteFile(previous.id);
    },
    [deleteFile, setFile],
  );

  const {
    fileInputRef,
    uploadingFiles,
    uploadProgress,
    uploadErrors,
    handleFiles: handleFilesUpload,
  } = useFileUpload(onFileUploaded, FILTER_ALLOWED_EXTENSIONS);

  const handleFiles = useCallback(
    (files: FileList | File[] | null) => {
      const [firstFile] = files ? Array.from(files) : [];
      handleFilesUpload(firstFile ? [firstFile] : null);
    },
    [handleFilesUpload],
  );

  const handleCrsChange = useCallback(
    (_id: string, crs: string) => {
      updateFilterFile({ crs });
    },
    [updateFilterFile],
  );

  // Saved on selection, as in the soil data step, so the map preview shows where the chosen CRS puts the file
  const handleCrsSelect = useCallback(
    async (id: string, crs: string) => {
      const epsg = epsgCode(crs);
      if (epsg === undefined) return;
      const selection = ++latestCrsSelection.current;
      updateFilterFile({ crs, georeferenceWgs84: undefined });
      try {
        const updated = await saveFileCrs({ epsg });
        if (latestCrsSelection.current !== selection || filterFileRef.current?.id !== id) return;
        updateFilterFile({ suppliedCrs: `EPSG:${epsg}`, georeferenceWgs84: updated?.metadata?.georeference_wgs84 });
      } catch {
        // Already notified
      }
    },
    [saveFileCrs, updateFilterFile],
  );

  const removeFile = useCallback(
    async (id: string) => {
      setFile(null);
      await deleteFile(id);
    },
    [deleteFile, setFile],
  );

  const annotatedFile = useMemo<SoilDataFile | null>(() => {
    if (!filterFile) return null;
    return { ...filterFile, error: filterFile.isUngeoreferencedRaster ? t('datasets.soil_data.no_georeference_error') : null };
  }, [filterFile, t]);

  // The install reads the CRS from the file, so it must be detected or already saved, not just typed
  const isInstallEnabled =
    !!annotatedFile &&
    !annotatedFile.error &&
    uploadingFiles.length === 0 &&
    (!!annotatedFile.inferredCrs || !!annotatedFile.suppliedCrs || !!annotatedFile.hasCustomCrs) &&
    isFormValid &&
    !isCreating;

  const handleInstall = useCallback(async () => {
    if (!filterFile) return;

    try {
      // The file now belongs to the filter: the install deletes it once it succeeds
      const created = await createFilter({ ...trimmedFormData(), file_id: filterFile.id, kind: 'categorical' });
      await queryClient.invalidateQueries({ queryKey: ['rasterFilters'] });
      // Replaced, so going back does not return to an emptied form
      navigate(`${ADMIN_PATHS.FILTERS_EDIT}/${created.id}`, { replace: true });
    } catch {
      // Already notified
    }
  }, [filterFile, trimmedFormData, createFilter, queryClient, navigate]);

  return {
    fileInputRef,
    filterFile: annotatedFile,
    uploadingFiles,
    uploadProgress,
    uploadErrors,
    crsOptions,
    handleFiles,
    handleCrsChange,
    handleCrsSelect,
    removeFile,
    formData,
    isCreating,
    isInstallEnabled,
    handleChange,
    handleInstall,
  };
}
