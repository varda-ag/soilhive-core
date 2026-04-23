import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useApiQuery } from './useApiQuery';
import { useCreateDatasetFileMapping } from 'hooks/useDatasetMutation';
import { useFileUpload } from './useFileUpload';
import { arraysMatch } from '../utilities/validation';
import { useFileManagement } from './useFileManagement';
import { ADMIN_PATHS } from '../configuration/admin';
import { BACKEND_BASE_URL } from '../configuration/api';
import { useRequest } from '../api-client';
import type { SoilDataFile } from '../types/soilDataFile';
import type { FileDescriptor } from 'types/backend';
import { useTranslation } from 'react-i18next';

export const ALLOWED_EXTENSIONS = ['.csv', 'gpkg', '.geojson', '.shp', '.xlsx', '.zip'];

export function useDatasetsSoilData() {
  const { t } = useTranslation('admin');
  const navigate = useNavigate();
  const { request } = useRequest();
  const { id: datasetId } = useParams();
  const queryClient = useQueryClient();
  const { mutateAsync: createFileMapping } = useCreateDatasetFileMapping();

  const [soilDataFiles, setSoilDataFiles] = useState<SoilDataFile[]>([]);
  const existingFileIds = useRef<Set<string>>(new Set());

  const { data: crsOptions = [] } = useApiQuery<number[]>({
    endpoint: '/epsg',
    method: 'GET',
    queryKey: ['epsg'],
    enabled: true,
  });

  // annotate errors if any
  const annotatedFiles = useMemo<SoilDataFile[]>(() => {
    const masterFieldNames = soilDataFiles[0]?.fieldNames;
    return soilDataFiles.map((f, i) => {
      if (i === 0 || !masterFieldNames || !f.fieldNames) return { ...f, error: null, missingFields: undefined, extraFields: undefined };
      if (arraysMatch(masterFieldNames, f.fieldNames)) return { ...f, error: null, missingFields: undefined, extraFields: undefined };
      const fileSet = new Set(f.fieldNames);
      const masterSet = new Set(masterFieldNames);
      return {
        ...f,
        error: t('datasets.mappings.file_inconsistency'),
        missingFields: masterFieldNames.filter(field => !fileSet.has(field)),
        extraFields: f.fieldNames.filter(field => !masterSet.has(field)),
      };
    });
  }, [soilDataFiles, t]);

  const isContinueEnabled = annotatedFiles.length > 0 && annotatedFiles.every(f => (!!f.crs || !!f.inferredCrs) && !f.error);

  const updateSoilDataFile = useCallback((id: string, updates: Partial<SoilDataFile>) => {
    setSoilDataFiles(prev => prev.map(f => (f.id === id ? { ...f, ...updates } : f)));
  }, []);

  const { fileInputRef, uploadingFiles, uploadProgress, uploadErrors, handleFiles } = useFileUpload((uploaded: SoilDataFile) =>
    setSoilDataFiles(prev => [...prev, uploaded]),
  );

  const { deleteFileAndMapping } = useFileManagement();

  // Load all files that are already in the backend
  const { data: existingFiles, isLoading: isLoadingFiles } = useApiQuery<FileDescriptor[]>({
    endpoint: `/datasets/${datasetId}/files`,
    method: 'GET',
    queryKey: ['datasets', datasetId, 'files'],
    enabled: !!datasetId,
  });

  useEffect(() => {
    if (!existingFiles) return;
    existingFileIds.current = new Set(existingFiles.filter(f => f !== null).map(f => f.id)); // keep track of files that already exist in the backend
    setSoilDataFiles(
      // align UI files with backend state
      existingFiles
        .filter(f => f !== null)
        .map(f => ({
          id: f.id,
          file: null,
          name: f.name,
          crs: null, // manually added by user
          inferredCrs: f.metadata?.epsg ? `EPSG:${f.metadata.epsg}` : undefined,
          fieldNames: f.metadata?.field_names,
          progress: 100,
        })),
    );
  }, [existingFiles]);

  const removeFile = useCallback(
    async (id: string) => {
      await deleteFileAndMapping(id);
      setSoilDataFiles(prev => prev.filter(f => f.id !== id));
    },
    [deleteFileAndMapping],
  );

  const clearAll = useCallback(async () => {
    const toDeleteIds = soilDataFiles.map(f => f.id).filter(Boolean) as string[];
    const results = await Promise.allSettled(toDeleteIds.map(id => deleteFileAndMapping(id)));
    const deletedIds = toDeleteIds.filter((_, i) => results[i]!.status === 'fulfilled'); // only remove from UI if successfully deleted from backend to avoid mismatch
    setSoilDataFiles(prev => prev.filter(f => !deletedIds.includes(f.id)));
  }, [soilDataFiles, deleteFileAndMapping]);

  const handleSave = useCallback(async () => {
    if (!datasetId) return;
    const newFiles = soilDataFiles.filter(f => !existingFileIds.current.has(f.id));

    await Promise.allSettled(newFiles.map(f => createFileMapping({ datasetId, fileID: f.id })));

    // Update crs for any file where the user set a crs that differs from the inferred one
    const filesWithUpdatedCrs = soilDataFiles.filter(f => f.crs && f.crs !== f.inferredCrs);
    await Promise.allSettled(
      filesWithUpdatedCrs.map(f =>
        request({
          url: `${BACKEND_BASE_URL}/files/${f.id}`,
          method: 'PATCH',
          body: { epsg: Number(f.crs!.replace('EPSG:', '')) },
          showErrorNotification: true,
        }),
      ),
    );

    await queryClient.invalidateQueries({ queryKey: ['datasets', datasetId, 'files'] }); // if we save successfully, refetch files to make sure UI is in sync with backend
  }, [datasetId, soilDataFiles, createFileMapping, request, queryClient]);

  return {
    fileInputRef,
    soilDataFiles: annotatedFiles,
    uploadingFiles,
    uploadErrors,
    uploadProgress,
    crsOptions,
    isContinueEnabled,
    isLoadingFiles,
    handleFiles,
    handleCrsChange: (id: string, crs: string) => updateSoilDataFile(id, { crs }),
    removeFile,
    clearAll,
    handlePrevious: () => navigate(`${ADMIN_PATHS.DATASETS}/edit/${datasetId}/general-info`),
    handleSaveAndContinueLater: () => {
      handleSave();
      navigate(ADMIN_PATHS.DATASETS);
    },
    handleContinue: () => {
      handleSave();
      navigate(`${ADMIN_PATHS.DATASETS}/edit/${datasetId}/mappings`);
    },
  };
}
