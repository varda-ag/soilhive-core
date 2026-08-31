import { useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { BACKEND_BASE_URL } from '../configuration/api';
import { getToken } from '../auth/tokenStore';
import { useStorageConfig } from './useStorageConfig';
import { formatUploadSize } from 'utilities/formatUploadSize';

export const ADDITIONAL_RESOURCE_EXTENSIONS = ['.txt', '.pdf', '.doc', '.docx', '.tif', '.tiff'];

export function useAdditionalResourceUpload(onFileUploaded: (resource: { file_id: string; name: string }) => void) {
  const { t } = useTranslation('admin');
  const { storageConfig } = useStorageConfig();
  const maxUploadSizeMB = storageConfig?.maxUploadSizeMB;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFiles, setUploadingFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number[]>>({});
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);

  const uploadFile = useCallback(
    (file: File): Promise<{ id: string; name: string }> => {
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
              const response = JSON.parse(xhr.responseText);
              resolve({ id: response.id, name: response.name ?? file.name });
            } else if (xhr.status === 0) {
              reject(new Error(t('datasets.soil_data.network_error')));
            } else {
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

        // spatial=false: these are supplementary files (csv, xlsx, etc.), not spatial datasets, so skip GDAL metadata extraction
        xhr.open('POST', `${BACKEND_BASE_URL}/files?spatial=false`);
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
        if (!ADDITIONAL_RESOURCE_EXTENSIONS.includes(extension)) {
          extensionErrors.push(`${file.name}: ${t('datasets.mappings.details.additional_resources_invalid_file_type')}`);
          return;
        }
        if (maxUploadSizeMB !== undefined && file.size > maxUploadSizeMB * 1024 * 1024) {
          extensionErrors.push(
            `${file.name}: ${t('datasets.mappings.details.additional_resources_file_too_large', { size: formatUploadSize(maxUploadSizeMB) })}`,
          );
          return;
        }
        validFiles.push(file);
      });

      if (extensionErrors.length > 0) setUploadErrors(extensionErrors);
      if (validFiles.length === 0) return;

      setUploadingFiles(validFiles);

      await Promise.allSettled(
        validFiles.map(async file => {
          try {
            const { id, name } = await uploadFile(file);
            onFileUploaded({ file_id: id, name });
          } catch (err) {
            const message =
              err instanceof Error && err.message ? err.message : t('datasets.mappings.details.additional_resources_upload_error');
            setUploadErrors(prev => [...prev, `${file.name}: ${message}`]);
          }
        }),
      );

      setUploadingFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [uploadFile, onFileUploaded, t, maxUploadSizeMB],
  );

  return { fileInputRef, uploadingFiles, uploadProgress, uploadErrors, handleFiles };
}
