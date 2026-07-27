import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useApiQuery } from './useApiQuery';
import { useCreateDatasetFileMapping, useUpdateDatasetMutation } from 'hooks/useDatasetMutation';
import { useFileUpload } from './useFileUpload';
import { arraysMatch } from '../utilities/validation';
import { useFileManagement } from './useFileManagement';
import { useIngestionStatus } from './useIngestionStatus';
import { ADMIN_PATHS } from '../configuration/admin';
import { BACKEND_BASE_URL } from '../configuration/api';
import { useRequest } from '../api-client';
import type { SoilDataFile } from '../types/soilDataFile';
import type { FileDescriptor } from 'types/backend';
import { GISDataType } from 'types/backend';
import { useTranslation } from 'react-i18next';
import useIngestionFlow from './useIngestionFlow';
import { useDataset } from './useDatasets';

export const ALLOWED_EXTENSIONS = ['.csv', '.gpkg', '.geojson', '.shp', '.xlsx', '.zip', '.tif', '.tiff'];

export function useDatasetsSoilData() {
  const { t } = useTranslation('admin');
  const navigate = useNavigate();
  const { request } = useRequest();
  const { id: datasetId } = useParams();
  const { markAsChanged, resetChanges, setIsRaster, isRaster } = useIngestionFlow();
  const queryClient = useQueryClient();
  const { mutateAsync: createFileMapping } = useCreateDatasetFileMapping();
  const { mutateAsync: updateDataset } = useUpdateDatasetMutation(datasetId ?? '');
  const { isLoading: isIngestionLoading, updateFurthestStep } = useIngestionStatus();

  const hasTracked = useRef(false);

  useEffect(() => {
    markAsChanged();
  }, [markAsChanged]);

  useEffect(() => {
    if (!hasTracked.current && datasetId && !isIngestionLoading) {
      hasTracked.current = true;
      updateFurthestStep(datasetId, 'soil-data');
    }
  }, [datasetId, isIngestionLoading, updateFurthestStep]);

  const [soilDataFiles, setSoilDataFiles] = useState<SoilDataFile[]>([]);
  const [dataFormatErrors, setDataFormatErrors] = useState<string[]>([]);
  const existingFileIds = useRef<Set<string>>(new Set());
  // Tracks the format established by the first uploaded/loaded file.
  // undefined = no files yet; true = raster; false = vector
  const establishedIsRasterRef = useRef<boolean | undefined>(undefined);

  const { data: dataset } = useDataset(datasetId);
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

  const { deleteFileAndMapping } = useFileManagement();

  const onFileUploaded = useCallback(
    async (uploaded: SoilDataFile) => {
      if (establishedIsRasterRef.current === undefined) {
        establishedIsRasterRef.current = uploaded.isRaster;
        setIsRaster(uploaded.isRaster);
        setSoilDataFiles(prev => [...prev, uploaded]);
      } else if (uploaded.isRaster === undefined || uploaded.isRaster === establishedIsRasterRef.current) {
        setSoilDataFiles(prev => [...prev, uploaded]);
      } else {
        await deleteFileAndMapping(uploaded.id);
        setDataFormatErrors(prev => [...prev, t('datasets.soil_data.mixed_format_error', { count: 1 })]);
      }
    },
    [deleteFileAndMapping, setIsRaster, t],
  );

  const { fileInputRef, uploadingFiles, uploadProgress, uploadErrors, handleFiles: handleFilesUpload } = useFileUpload(onFileUploaded);

  const handleFiles = useCallback(
    (files: FileList | File[] | null) => {
      setDataFormatErrors([]);
      handleFilesUpload(files);
    },
    [handleFilesUpload],
  );

  const handleCrsChange = useCallback(
    (id: string, crs: string) => {
      updateSoilDataFile(id, { crs });
    },
    [updateSoilDataFile],
  );

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
    const mapped = existingFiles
      .filter(f => f !== null)
      .map(f => ({
        id: f.id,
        file: null,
        name: f.name,
        crs: null, // manually added by user
        inferredCrs: f.metadata?.epsg ? `EPSG:${f.metadata.epsg}` : undefined,
        fieldNames: f.metadata?.field_names,
        isRaster: f.metadata?.['is_raster'] as boolean | undefined,
        progress: 100,
      }));
    establishedIsRasterRef.current = mapped[0]?.isRaster;
    setIsRaster(mapped[0]?.isRaster);
    setSoilDataFiles(mapped);
  }, [existingFiles, setIsRaster]);

  const removeFile = useCallback(
    async (id: string) => {
      await deleteFileAndMapping(id);
      setSoilDataFiles(prev => {
        const wasFirst = prev[0]?.id === id;
        const newFiles = prev.filter(f => f.id !== id);
        if (wasFirst) {
          // Update established format to the new first file, or reset if list is now empty
          establishedIsRasterRef.current = newFiles[0]?.isRaster;
          setIsRaster(newFiles[0]?.isRaster);
        }
        return newFiles;
      });
    },
    [deleteFileAndMapping, setIsRaster],
  );

  const clearAll = useCallback(async () => {
    const toDeleteIds = soilDataFiles.map(f => f.id).filter(Boolean) as string[];
    const results = await Promise.allSettled(toDeleteIds.map(id => deleteFileAndMapping(id)));
    const deletedIds = toDeleteIds.filter((_, i) => results[i]!.status === 'fulfilled'); // only remove from UI if successfully deleted from backend to avoid mismatch
    setSoilDataFiles(prev => prev.filter(f => !deletedIds.includes(f.id)));
    setDataFormatErrors([]);
    if (deletedIds.length >= soilDataFiles.length) {
      establishedIsRasterRef.current = undefined;
      setIsRaster(undefined);
    }
  }, [soilDataFiles, deleteFileAndMapping, setIsRaster]);

  const handleSave = useCallback(async () => {
    if (!datasetId) return;
    resetChanges();
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

    await updateDataset({ gis_datatype: isRaster ? GISDataType.RASTER : null });

    await queryClient.invalidateQueries({ queryKey: ['datasets', datasetId, 'files'] }); // if we save successfully, refetch files to make sure UI is in sync with backend
    await queryClient.invalidateQueries({ queryKey: ['datasets', datasetId, 'dataset-file-mapping'] });
    await queryClient.invalidateQueries({ queryKey: ['datasets', datasetId] });
  }, [datasetId, soilDataFiles, createFileMapping, request, queryClient, resetChanges, isRaster, updateDataset]);

  const datasetName = useMemo(() => {
    return dataset?.name || '';
  }, [dataset]);

  return {
    datasetName,
    fileInputRef,
    soilDataFiles: annotatedFiles,
    uploadingFiles,
    uploadErrors: [...uploadErrors, ...dataFormatErrors],
    uploadProgress,
    crsOptions,
    isContinueEnabled,
    isLoadingFiles: isLoadingFiles,
    handleFiles,
    handleCrsChange,
    removeFile,
    clearAll,
    handlePrevious: () => navigate(`${ADMIN_PATHS.DATASETS}/edit/${datasetId}/general-info`),
    handleSaveAndContinueLater: async () => {
      await handleSave();
      navigate(ADMIN_PATHS.DATASETS);
    },
    handleContinue: () => {
      handleSave();
      navigate(`${ADMIN_PATHS.DATASETS}/edit/${datasetId}/mappings`);
    },
  };
}
