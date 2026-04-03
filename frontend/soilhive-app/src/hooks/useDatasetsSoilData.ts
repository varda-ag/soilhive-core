import { useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { SoilDataFile } from '../types/soilDataFile';

const ROUTES = {
  PREV: '../general-info',
  SAVE: '../../datasets',
  NEXT: '../mappings',
};

export const ALLOWED_EXTENSIONS = ['.csv', 'gpkg', '.geojson', '.shp', '.xlsx', '.zip'];

export function useDatasetsSoilData() {
  const { t } = useTranslation('admin');
  const navigate = useNavigate();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [soilDataFiles, setSoilDataFiles] = useState<SoilDataFile[]>([]); // Successfully uploaded files with their server IDs and CRS info
  const [uploadingFiles, setUploadingFiles] = useState<File[]>([]); // Used to keep track of files currently being uploaded and show progress bars in FileUploadBox
  const [uploadProgress, setUploadProgress] = useState<Record<string, number[]>>({});
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);

  const isContinueEnabled = soilDataFiles.length > 0 && soilDataFiles.every(f => !!f.crs && !f.error);

  const updateSoilDataFile = useCallback((id: string, updates: Partial<SoilDataFile>) => {
    setSoilDataFiles(prev => prev.map(f => (f.id === id ? { ...f, ...updates } : f)));
  }, []);

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

        xhr.open('POST', '/files');
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
      setUploadingFiles(fileArray);

      // Wait for all uploads in this batch to finish
      await Promise.allSettled(
        fileArray.map(async file => {
          try {
            const { id, crs } = await uploadFile({ file } as any);
            setSoilDataFiles(prev => [
              ...prev,
              {
                id,
                file,
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
      const fileToRemove = soilDataFiles.find(f => f.id === id);
      setSoilDataFiles(prev => prev.filter(f => f.id !== id));

      if (fileToRemove?.id) {
        try {
          await fetch(`/files/${fileToRemove.id}`, { method: 'DELETE' });
        } catch (error) {
          console.error('Failed to delete file from server', error);
        }
      }
    },
    [soilDataFiles],
  );

  const clearAll = useCallback(async () => {
    const syncedIds = soilDataFiles.map(f => f.id).filter(Boolean) as string[];
    setSoilDataFiles([]);
    setUploadingFiles([]);
    await Promise.allSettled(syncedIds.map(id => fetch(`/files/${id}`, { method: 'DELETE' })));
  }, [soilDataFiles]);

  return {
    fileInputRef,
    soilDataFiles,
    uploadingFiles,
    uploadErrors,
    uploadProgress,
    isContinueEnabled,
    handleFiles,
    handleCrsChange: (id: string, crs: string) => updateSoilDataFile(id, { crs }),
    removeFile,
    clearAll,
    handlePrevious: () => navigate(ROUTES.PREV, { relative: 'path' }),
    handleSaveAndContinueLater: () => navigate(ROUTES.SAVE, { relative: 'path' }),
    handleContinue: () => navigate(ROUTES.NEXT, { relative: 'path' }),
  };
}
