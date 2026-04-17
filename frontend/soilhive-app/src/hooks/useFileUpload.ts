import { useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { BACKEND_BASE_URL } from '../configuration/api';
import { getToken } from '../auth/tokenStore';
import { ALLOWED_EXTENSIONS } from './useDatasetsSoilData';
import type { SoilDataFile } from '../types/soilDataFile';

export function useFileUpload(onFileUploaded: (file: SoilDataFile) => void) {
  const { t } = useTranslation('admin');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFiles, setUploadingFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number[]>>({});
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);

  const uploadFile = useCallback(
    (file: File): Promise<{ id: string; crs?: string }> => {
      return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', event => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(prev => ({ ...prev, [file.name]: [percent] }));
          }
        });

        xhr.onreadystatechange = () => {
          if (xhr.readyState === XMLHttpRequest.DONE) {
            if (xhr.status >= 200 && xhr.status < 300) {
              // Parse response to build string CRS from EPSG code
              const response = JSON.parse(xhr.responseText);
              resolve({ id: response.id, crs: response.metadata?.epsg ? `EPSG:${response.metadata.epsg}` : undefined });
            } else if (xhr.status === 0) {
              // Network failure
              reject(new Error(t('datasets.soil_data.network_error')));
            } else {
              // Real server error
              let message;
              try {
                const body = JSON.parse(xhr.responseText);
                if (body?.message) message = body.message;
              } catch {
                message = t('datasets.soil_data.upload_error');
              }
              reject(new Error(`${message}`));
            }
          }
        };

        xhr.open('POST', `${BACKEND_BASE_URL}/files`);
        xhr.setRequestHeader('Authorization', `Bearer ${getToken()}`);
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

      if (extensionErrors.length > 0) setUploadErrors(extensionErrors);
      if (validFiles.length === 0) return;

      setUploadingFiles(validFiles);

      await Promise.allSettled(
        validFiles.map(async file => {
          try {
            const { id, crs } = await uploadFile(file);
            onFileUploaded({ id, file, name: file.name, crs: crs ?? null, inferredCrs: crs, progress: 100 });
          } catch (err) {
            const reason = (err instanceof Error && err.message && err.message !== 'undefined') || t('datasets.soil_data.upload_error');
            setUploadErrors(prev => [...prev, `${file.name}: ${reason}`]);
          }
        }),
      );

      setUploadingFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [uploadFile, onFileUploaded, t],
  );

  return { fileInputRef, uploadingFiles, uploadProgress, uploadErrors, handleFiles };
}
