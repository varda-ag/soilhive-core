import { useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { SoilDataFile } from '../types/soilDataFile';

const ROUTES = {
  PREV: '../general-info',
  SAVE: '../../datasets',
  NEXT: '../mappings',
};

export function useDatasetsSoilData() {
  const { t } = useTranslation('admin');
  const navigate = useNavigate();

  // Used to generate temporary IDs for files before they're saved and get a real ID from the server
  const fileCounterRef = useRef(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [soilDataFiles, setSoilDataFiles] = useState<SoilDataFile[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<File[]>([]);

  const isContinueEnabled = soilDataFiles.length > 0 && soilDataFiles.every(f => !!f.crs && !f.error);

  const updateFileState = useCallback((tmpId: string, updates: Partial<SoilDataFile>) => {
    setSoilDataFiles(prev => prev.map(f => (f.tmpId === tmpId ? { ...f, ...updates } : f)));
  }, []);

  const uploadFile = useCallback(
    (soilDataFile: SoilDataFile): Promise<{ id: string; crs?: string }> => {
      return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', soilDataFile.file);

        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', event => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            // Update progress directly in the main state
            updateFileState(soilDataFile.tmpId, { progress: percent });
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
    [t, updateFileState],
  );

  const handleFiles = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files || files.length === 0) return;

      const fileArray = Array.from(files);

      setUploadingFiles(fileArray);

      const newFiles: SoilDataFile[] = fileArray.map(file => {
        const currentId = `file-${fileCounterRef.current}`;

        fileCounterRef.current += 1;

        return {
          tmpId: currentId,
          file,
          progress: 0,
          crs: null,
          inferredCrs: null,
          error: null,
        };
      });

      setSoilDataFiles(prev => [...prev, ...newFiles]);

      // Wait for all uploads in this batch to finish
      await Promise.allSettled(
        newFiles.map(async fileObj => {
          try {
            const { id, crs } = await uploadFile(fileObj);
            updateFileState(fileObj.tmpId, { id, inferredCrs: crs, crs: crs ?? null });
          } catch {
            updateFileState(fileObj.tmpId, {
              error: t('datasets.soil_data.upload_error'),
              progress: 0,
            });
          }
        }),
      );

      // Only clear once the batch is done so the FileUploadBox reverts to "Drop area"
      setUploadingFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [uploadFile, updateFileState, t],
  );

  const removeFile = useCallback(
    async (tmpId: string) => {
      const fileToRemove = soilDataFiles.find(f => f.tmpId === tmpId);
      setSoilDataFiles(prev => prev.filter(f => f.tmpId !== tmpId));

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
    isContinueEnabled,
    handleFiles,
    handleCrsChange: (tmpId: string, crs: string) => updateFileState(tmpId, { crs }),
    removeFile,
    clearAll,
    handlePrevious: () => navigate(ROUTES.PREV, { relative: 'path' }),
    handleSaveAndContinueLater: () => navigate(ROUTES.SAVE, { relative: 'path' }),
    handleContinue: () => navigate(ROUTES.NEXT, { relative: 'path' }),
  };
}
