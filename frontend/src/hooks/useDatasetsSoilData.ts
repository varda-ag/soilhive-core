import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useApiQuery } from './useApiQuery';
import { useCreateDatasetFileMapping, useUpdateDatasetMutation } from 'hooks/useDatasetMutation';
import { useFileUpload } from './useFileUpload';
import { arraysMatch } from '../utilities/validation';
import { epsgCode, hasCustomCrs } from '../utilities/crs';
import { georeferenceOf } from '../utilities/georeference';
import { useFileManagement } from './useFileManagement';
import { useIngestionStatus } from './useIngestionStatus';
import { ADMIN_PATHS } from '../configuration/admin';
import { BACKEND_BASE_URL } from '../configuration/api';
import { useRequest } from '../api-client';
import type { SoilDataFile } from '../types/soilDataFile';
import type { FileDescriptor } from 'types/backend';
import { GISDataType, IngestionStatus } from 'types/backend';
import { useTranslation } from 'react-i18next';
import useIngestionFlow from './useIngestionFlow';
import { useDataset } from './useDatasets';
import { useCreateJobMutation } from './useJobsApi';

// No '.shp' or '.gdb': ZIP archive is required
export const ALLOWED_EXTENSIONS = ['.csv', '.gpkg', '.geojson', '.xlsx', '.kml', '.kmz', '.gml', '.zip', '.tif', '.tiff'];

// A loaded vector File's observations don't record which File they came from, so it can't be removed
export const isRemovable = (file: SoilDataFile): boolean => !(file.isLoaded && !file.isRaster);

export function useDatasetsSoilData() {
  const { t } = useTranslation('admin');
  const navigate = useNavigate();
  const { request } = useRequest();
  const { id: datasetId } = useParams();
  const { markAsChanged, resetChanges, setIsRaster, isRaster } = useIngestionFlow();
  const queryClient = useQueryClient();
  const { mutateAsync: createFileMapping } = useCreateDatasetFileMapping();
  const { mutateAsync: updateDataset } = useUpdateDatasetMutation(datasetId ?? '');
  const { mutateAsync: createJob } = useCreateJobMutation({ showErrorNotification: true });
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
  const [isSaving, setIsSaving] = useState(false);
  // Loaded raster Files waiting for the user to confirm their removal
  const [removalToConfirm, setRemovalToConfirm] = useState<string[] | null>(null);
  const existingFileIds = useRef<Set<string>>(new Set());
  // Saved files the user removed: deleted on save, so leaving without saving keeps them
  const pendingRemovalIds = useRef<Set<string>>(new Set());
  // Tracks the format established by the first uploaded/loaded file.
  // undefined = no files yet; true = raster; false = vector
  const establishedIsRasterRef = useRef<boolean | undefined>(undefined);

  const { data: dataset } = useDataset(datasetId);
  const { data: crsOptions = [] } = useApiQuery<{ code: number; name: string }[]>({
    endpoint: '/epsg',
    method: 'GET',
    queryKey: ['epsg'],
    enabled: true,
  });

  // annotate errors if any
  const annotatedFiles = useMemo<SoilDataFile[]>(() => {
    const masterFieldNames = soilDataFiles[0]?.fieldNames;
    return soilDataFiles.map((f, i) => {
      if (f.isUngeoreferencedRaster) {
        return { ...f, error: t('datasets.soil_data.no_georeference_error'), missingFields: undefined, extraFields: undefined };
      }
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

  const latestCrsSelection = useRef<Record<string, number>>({});

  // Saved on selection rather than on Continue, so the map preview shows where the chosen CRS puts the file
  const handleCrsSelect = useCallback(
    async (id: string, crs: string) => {
      const epsg = epsgCode(crs);
      if (epsg === undefined) return;
      const selection = (latestCrsSelection.current[id] ?? 0) + 1;
      latestCrsSelection.current[id] = selection;
      updateSoilDataFile(id, { crs, georeferenceWgs84: undefined });
      try {
        const updated: FileDescriptor | null = await request({
          url: `${BACKEND_BASE_URL}/files/${id}`,
          method: 'PATCH',
          body: { epsg },
          showErrorNotification: true,
        });
        if (latestCrsSelection.current[id] !== selection) return;
        updateSoilDataFile(id, { suppliedCrs: `EPSG:${epsg}`, georeferenceWgs84: updated?.metadata?.georeference_wgs84 });
      } catch {
        // Already notified; handleSave retries it
      }
    },
    [request, updateSoilDataFile],
  );

  // Load all files that are already in the backend
  const { data: existingFiles, isLoading: isLoadingFiles } = useApiQuery<FileDescriptor[]>({
    endpoint: `/datasets/${datasetId}/files`,
    method: 'GET',
    queryKey: ['datasets', datasetId, 'files'],
    enabled: !!datasetId,
  });

  // A file needs a CRS: an EPSG code, chosen or detected. Also block while an upload is still in flight.
  // Previous saves too: an empty list is fine to save, but not before the saved files have loaded,
  // or it would save that empty list and reset the dataset's raster type
  const isPreviousEnabled =
    existingFiles !== undefined &&
    uploadingFiles.length === 0 &&
    annotatedFiles.every(f => (!!f.crs || !!f.inferredCrs || !!f.suppliedCrs || !!f.hasCustomCrs) && !f.error);
  const isContinueEnabled = isPreviousEnabled && annotatedFiles.length > 0;

  useEffect(() => {
    if (!existingFiles) return;
    existingFileIds.current = new Set(existingFiles.filter(f => f !== null).map(f => f.id)); // keep track of files that already exist in the backend
    const mapped = existingFiles
      .filter(f => f !== null && !pendingRemovalIds.current.has(f.id))
      .map(f => {
        const savedCrs = f.metadata?.epsg ? `EPSG:${f.metadata.epsg}` : undefined;
        const isSupplied = f.metadata?.crs_source === 'supplied';
        return {
          id: f.id,
          file: null,
          name: f.name,
          crs: null, // manually added by user
          inferredCrs: isSupplied ? undefined : savedCrs,
          suppliedCrs: isSupplied ? savedCrs : undefined,
          hasCustomCrs: hasCustomCrs(f.metadata),
          fieldNames: f.metadata && !f.metadata.is_raster ? f.metadata.field_names : undefined,
          isRaster: f.metadata?.is_raster,
          rasterBands: f.metadata?.is_raster ? f.metadata.raster_bands : undefined,
          isLoaded: f.status === IngestionStatus.LOADED,
          ...georeferenceOf(f.metadata),
          progress: 100,
        };
      });
    establishedIsRasterRef.current = mapped[0]?.isRaster;
    setIsRaster(mapped[0]?.isRaster);
    setSoilDataFiles(mapped);
  }, [existingFiles, setIsRaster]);

  // Saved files are removed on save; files uploaded in this visit are deleted straight away, and
  // leave the list only once that succeeded, to avoid a mismatch with the backend
  const removeFiles = useCallback(
    async (ids: string[]) => {
      const savedIds = ids.filter(id => existingFileIds.current.has(id));
      const toDeleteIds = ids.filter(id => !existingFileIds.current.has(id));
      savedIds.forEach(id => pendingRemovalIds.current.add(id));
      const results = await Promise.allSettled(toDeleteIds.map(id => deleteFileAndMapping(id)));
      const deletedIds = toDeleteIds.filter((_, i) => results[i]!.status === 'fulfilled');
      const removedIds = new Set([...savedIds, ...deletedIds]);
      setSoilDataFiles(prev => {
        const newFiles = prev.filter(f => !removedIds.has(f.id));
        if (prev[0] && removedIds.has(prev[0].id)) {
          // Update established format to the new first file, or reset if list is now empty
          establishedIsRasterRef.current = newFiles[0]?.isRaster;
          setIsRaster(newFiles[0]?.isRaster);
        }
        return newFiles;
      });
    },
    [deleteFileAndMapping, setIsRaster],
  );

  // Removing a loaded raster File takes its layers out of the dataset on save, and out of a
  // published one's reads straight away, so it is confirmed first
  const needsConfirmation = useCallback(
    (ids: string[]) =>
      (dataset?.status === IngestionStatus.LOADED || dataset?.status === IngestionStatus.PUBLISHED) &&
      soilDataFiles.some(f => ids.includes(f.id) && f.isLoaded && f.isRaster),
    [dataset?.status, soilDataFiles],
  );

  const requestRemoval = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      if (needsConfirmation(ids)) {
        setRemovalToConfirm(ids);
        return;
      }
      await removeFiles(ids);
    },
    [needsConfirmation, removeFiles],
  );

  const removeFile = useCallback(
    async (id: string) => {
      const file = soilDataFiles.find(f => f.id === id);
      if (file && !isRemovable(file)) return;
      await requestRemoval([id]);
    },
    [soilDataFiles, requestRemoval],
  );

  // Loaded vector files stay: they can't be removed
  const clearAll = useCallback(async () => {
    setDataFormatErrors([]);
    await requestRemoval(soilDataFiles.filter(f => f.id && isRemovable(f)).map(f => f.id));
  }, [soilDataFiles, requestRemoval]);

  const confirmRemoval = useCallback(async () => {
    const ids = removalToConfirm;
    setRemovalToConfirm(null);
    if (ids) await removeFiles(ids);
  }, [removalToConfirm, removeFiles]);

  const cancelRemoval = useCallback(() => setRemovalToConfirm(null), []);

  // Resolves false if a removal fails: it stays pending, nothing else is saved, and the next save retries it
  const handleSave = useCallback(async () => {
    if (!datasetId) return false;
    const removals = [...pendingRemovalIds.current];
    const removalResults = await Promise.allSettled(removals.map(id => deleteFileAndMapping(id)));
    removals.forEach((id, i) => {
      if (removalResults[i]!.status === 'fulfilled') pendingRemovalIds.current.delete(id);
    });
    if (pendingRemovalIds.current.size > 0) return false;

    // A removed loaded raster File's layers are hidden straight away, and taken out of the dataset by
    // the next raster-load. With a File still to map, the mappings step starts that load; otherwise
    // it is started here.
    const removedLoadedRaster = (existingFiles ?? []).some(
      f => f !== null && removals.includes(f.id) && f.status === IngestionStatus.LOADED && f.metadata?.is_raster,
    );
    if (removedLoadedRaster && !soilDataFiles.some(f => f.isRaster && !f.isLoaded)) {
      try {
        await createJob({ type: 'raster-load', dataset_id: datasetId });
      } catch {
        // Already notified; the next raster-load removes them
      }
    }

    resetChanges();
    const newFiles = soilDataFiles.filter(f => !existingFileIds.current.has(f.id));

    await Promise.allSettled(newFiles.map(f => createFileMapping({ datasetId, fileID: f.id })));

    // A selection is saved as soon as it is made: this catches one whose save failed
    const filesWithUnsavedCrs = soilDataFiles.filter(f => {
      const epsg = epsgCode(f.crs);
      return epsg !== undefined && `EPSG:${epsg}` !== f.suppliedCrs && f.crs !== f.inferredCrs;
    });
    await Promise.allSettled(
      filesWithUnsavedCrs.map(f =>
        request({
          url: `${BACKEND_BASE_URL}/files/${f.id}`,
          method: 'PATCH',
          body: { epsg: epsgCode(f.crs) },
          showErrorNotification: true,
        }),
      ),
    );

    const updatedDataset = await updateDataset({ gis_datatype: isRaster ? GISDataType.RASTER : null });

    await queryClient.invalidateQueries({ queryKey: ['datasets', datasetId, 'files'] }); // if we save successfully, refetch files to make sure UI is in sync with backend
    await queryClient.invalidateQueries({ queryKey: ['datasets', datasetId, 'dataset-file-mapping'] });
    // Write the fresh gis_datatype straight into the cache the mappings step reads (['dataset', id]) so it
    // renders the correct raster/default variant immediately on navigation instead of showing stale data
    // until its own background refetch resolves.
    queryClient.setQueryData(['dataset', datasetId], updatedDataset);
    return true;
  }, [
    datasetId,
    deleteFileAndMapping,
    existingFiles,
    soilDataFiles,
    createJob,
    createFileMapping,
    request,
    queryClient,
    resetChanges,
    isRaster,
    updateDataset,
  ]);

  const saveAndNavigate = async (path: string) => {
    setIsSaving(true);
    try {
      if (await handleSave()) navigate(path);
    } finally {
      setIsSaving(false);
    }
  };

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
    isPreviousEnabled,
    isContinueEnabled,
    isLoadingFiles: isLoadingFiles,
    handleFiles,
    handleCrsChange,
    handleCrsSelect,
    removeFile,
    clearAll,
    removalToConfirm,
    confirmRemoval,
    cancelRemoval,
    isSaving,
    handlePrevious: () => saveAndNavigate(`${ADMIN_PATHS.DATASETS}/edit/${datasetId}/general-info`),
    handleSaveAndContinueLater: () => saveAndNavigate(ADMIN_PATHS.DATASETS),
    handleContinue: () => saveAndNavigate(`${ADMIN_PATHS.DATASETS}/edit/${datasetId}/mappings`),
  };
}
