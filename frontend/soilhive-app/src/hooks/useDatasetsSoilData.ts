import { useRef, useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { SoilDataFile } from '../types/soilDataFile';
import { BACKEND_BASE_URL } from '../configuration/api';
import { getToken } from '../auth/tokenStore';
import { useRequest } from '../api-client';
import { useApiQuery } from './useApiQuery';
import type { FileDescriptor } from 'types/backend';
import { useCreateDatasetFileMapping } from './useCreateDatasetFileMapping';
import { ADMIN_PATHS } from '../configuration/admin';

export const ALLOWED_EXTENSIONS = ['.csv', 'gpkg', '.geojson', '.shp', '.xlsx', '.zip'];

export function useDatasetsSoilData() {
  const { t } = useTranslation('admin');
  const navigate = useNavigate();
  const { request } = useRequest();
  const { id: datasetId } = useParams();
  const { mutateAsync: createFileMapping } = useCreateDatasetFileMapping();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [soilDataFiles, setSoilDataFiles] = useState<SoilDataFile[]>([]); // Successfully uploaded files with their server IDs and CRS info
  const [uploadingFiles, setUploadingFiles] = useState<File[]>([]); // Used to keep track of files currently being uploaded and show progress bars in FileUploadBox
  const [uploadProgress, setUploadProgress] = useState<Record<string, number[]>>({});
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);

  const isContinueEnabled = soilDataFiles.length > 0 && soilDataFiles.every(f => !!f.crs && !f.error);

  const updateSoilDataFile = useCallback((id: string, updates: Partial<SoilDataFile>) => {
    setSoilDataFiles(prev => prev.map(f => (f.id === id ? { ...f, ...updates } : f)));
  }, []);

  // load existing files for this dataset on mount (if editing an existing dataset)
  const existingFileIds = useRef<Set<string>>(new Set());

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
          file: null, // no local File object for server-side files
          name: f.name,
          crs: f.metadata?.detected_fields?.crs ?? null,
          inferredCrs: f.metadata?.detected_fields?.crs,
          progress: 100,
        })),
    );
  }, [existingFiles]);

  const uploadFile = useCallback(
    (file: File): Promise<{ id: string; crs?: string }> => {
      return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);

        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', event => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            // Update the progress map using the filename as the key
            setUploadProgress(prev => ({
              ...prev,
              [file.name]: [percent],
            }));
          }
        });

        xhr.onreadystatechange = () => {
          if (xhr.readyState === XMLHttpRequest.DONE) {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(JSON.parse(xhr.responseText));
            } else {
              reject(new Error(t('datasets.soil_data.upload_error')));
            }
          }
        };

        const token = getToken();

        xhr.open('POST', `${BACKEND_BASE_URL}/files`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(formData);
      });
    },
    [t],
  );

  const handleFiles = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files || files.length === 0) return;

      setUploadErrors([]);

      const fileArray = Array.from(files);

      const validFiles: File[] = [];
      const extensionErrors: string[] = [];

      fileArray.forEach(file => {
        const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
        if (ALLOWED_EXTENSIONS.includes(extension)) {
          validFiles.push(file);
        } else {
          extensionErrors.push(`${file.name}: ${t('datasets.soil_data.invalid_file_type')}`);
        }
      });

      if (extensionErrors.length > 0) {
        setUploadErrors(extensionErrors);
      }

      if (validFiles.length === 0) return;

      // Add valid files to uploading state to show progress bars
      setUploadingFiles(validFiles);

      // Wait for all uploads in this batch to finish
      await Promise.allSettled(
        validFiles.map(async file => {
          try {
            const { id, crs } = await uploadFile(file);
            setSoilDataFiles(prev => [
              ...prev,
              {
                id: id,
                file,
                name: file.name,
                crs: crs ?? null,
                inferredCrs: crs,
                progress: 100,
              },
            ]);
          } catch {
            setUploadErrors(prev => [...prev, `${file.name}: ${t('datasets.soil_data.upload_error')}`]);
          }
        }),
      );

      // Only clear once the batch is done so the FileUploadBox reverts to "Drop area"
      setUploadingFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [uploadFile, t],
  );

  const removeFile = useCallback(
    async (id: string) => {
      await request({
        url: `${BACKEND_BASE_URL}/files/${id}`,
        method: 'DELETE',
        showErrorNotification: true,
      });
      setSoilDataFiles(prev => prev.filter(f => f.id !== id));
    },
    [request],
  );

  const clearAll = useCallback(async () => {
    const toDeleteIds = soilDataFiles.map(f => f.id).filter(Boolean) as string[];
    setUploadingFiles([]);

    const results = await Promise.allSettled(
      toDeleteIds.map(id => request({ url: `${BACKEND_BASE_URL}/files/${id}`, method: 'DELETE', showErrorNotification: true })),
    );

    const deletedIds = toDeleteIds.filter((_, i) => results[i]!.status === 'fulfilled'); // remove only successfully deleted files from state
    setSoilDataFiles(prev => prev.filter(f => !deletedIds.includes(f.id)));
  }, [soilDataFiles, request]);

  const handleSave = useCallback(async () => {
    if (!datasetId) return;

    const newFiles = soilDataFiles.filter(f => !existingFileIds.current.has(f.id));

    await Promise.allSettled(
      newFiles.map(f =>
        createFileMapping({
          datasetId,
          fileID: f.id,
        }),
      ),
    );
  }, [soilDataFiles, datasetId, createFileMapping]);

  return {
    fileInputRef,
    soilDataFiles,
    uploadingFiles,
    uploadErrors,
    uploadProgress,
    isContinueEnabled,
    isLoadingFiles,
    handleFiles,
    handleCrsChange: (id: string, crs: string) => updateSoilDataFile(id, { crs }),
    removeFile,
    clearAll,
    handlePrevious: () => {
      navigate(`${ADMIN_PATHS.DATASETS}/edit/${datasetId}/general-info`);
    },
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
