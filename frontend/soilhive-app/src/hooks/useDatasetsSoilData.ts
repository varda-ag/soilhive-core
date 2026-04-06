import { useRef, useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useApiQuery } from './useApiQuery';
import { useCreateDatasetFileMapping } from './useCreateDatasetFileMapping';
import { useFileUpload } from './useFileUpload';
import { useFileManagement } from './useFileManagement';
import { ADMIN_PATHS } from '../configuration/admin';
//import { BACKEND_BASE_URL } from '../configuration/api';
//import { useRequest } from '../api-client';
import type { SoilDataFile } from '../types/soilDataFile';
import type { FileDescriptor } from 'types/backend';

export const ALLOWED_EXTENSIONS = ['.csv', 'gpkg', '.geojson', '.shp', '.xlsx', '.zip'];

export function useDatasetsSoilData() {
  const navigate = useNavigate();
  //const { request } = useRequest();
  const { id: datasetId } = useParams();
  const { mutateAsync: createFileMapping } = useCreateDatasetFileMapping();

  const [soilDataFiles, setSoilDataFiles] = useState<SoilDataFile[]>([]);
  const existingFileIds = useRef<Set<string>>(new Set());

  // delete when BE is ready
  // TODO: un-comment when BE is ready
  /*const { data: crsOptions = [] } = useApiQuery<number[]>({
    endpoint: '/masterdata/crs',
    method: 'GET',
    queryKey: ['masterdata', 'crs'],
    enabled: false,
  });*/
  const crsOptions = [2154, 27700, 4326, 3857, 32632];

  const isContinueEnabled = soilDataFiles.length > 0 && soilDataFiles.every(f => !!f.crs && !f.error);

  const updateSoilDataFile = useCallback((id: string, updates: Partial<SoilDataFile>) => {
    setSoilDataFiles(prev => prev.map(f => (f.id === id ? { ...f, ...updates } : f)));
  }, []);

  const { fileInputRef, uploadingFiles, uploadProgress, uploadErrors, handleFiles } = useFileUpload((uploaded: SoilDataFile) =>
    setSoilDataFiles(prev => [...prev, uploaded]),
  );

  const { deleteFileAndMapping } = useFileManagement();

  const { data: existingFiles, isLoading: isLoadingFiles } = useApiQuery<FileDescriptor[]>({
    endpoint: `/datasets/${datasetId}/files`,
    method: 'GET',
    queryKey: ['datasets', datasetId, 'files'],
    enabled: !!datasetId,
  });

  useEffect(() => {
    if (!existingFiles) return;
    existingFileIds.current = new Set(existingFiles.map(f => f.id));
    setSoilDataFiles(
      existingFiles
        .filter(f => f !== null)
        .map(f => ({
          id: f.id,
          file: null,
          name: f.name,
          crs: f.metadata?.detected_fields?.crs ?? null,
          inferredCrs: f.metadata?.detected_fields?.crs,
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
    const deletedIds = toDeleteIds.filter((_, i) => results[i]!.status === 'fulfilled');
    setSoilDataFiles(prev => prev.filter(f => !deletedIds.includes(f.id)));
  }, [soilDataFiles, deleteFileAndMapping]);

  const handleSave = useCallback(async () => {
    if (!datasetId) return;
    const newFiles = soilDataFiles.filter(f => !existingFileIds.current.has(f.id));

    await Promise.allSettled(newFiles.map(f => createFileMapping({ datasetId, fileID: f.id })));

    // TODO: un-comment when BE is ready
    /*const filesWithUpdatedCrs = newFiles.filter(f => f.crs && f.crs !== f.inferredCrs);
    await Promise.allSettled(
      filesWithUpdatedCrs.map(f =>
        request({ url: `${BACKEND_BASE_URL}/files/${f.id}`, method: 'PATCH', body: { crs: Number(f.crs!.replace('EPSG:', '')) }, showErrorNotification: true })
      ),
    );*/
  }, [soilDataFiles, datasetId, createFileMapping]);

  return {
    fileInputRef,
    soilDataFiles,
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
