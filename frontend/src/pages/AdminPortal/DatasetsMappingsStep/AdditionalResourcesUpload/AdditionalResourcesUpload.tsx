import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileUploadBox } from 'components/UI';
import { useApiQueries } from 'hooks/useApiQueries';
import { useAdditionalResourceUpload, ADDITIONAL_RESOURCE_EXTENSIONS } from 'hooks/useAdditionalResourceUpload';
import type { FileDescriptor } from 'types/backend';
import FileIcon from 'assets/icons/small-file-icon.svg?react';
import CrossIcon from 'assets/icons/cross-icon.svg?react';
import styles from './AdditionalResourcesUpload.module.scss';

interface Props {
  value: { file_id: string }[];
  onChange: (value: { file_id: string }[]) => void;
}

export function AdditionalResourcesUpload({ value, onChange }: Props) {
  const { t } = useTranslation('admin');
  const [knownNames, setKnownNames] = useState<Record<string, string>>({});

  const unresolvedFileIds = useMemo(
    () => Array.from(new Set(value.map(r => r.file_id).filter(id => !knownNames[id]))),
    [value, knownNames],
  );

  const fileQueries = useApiQueries<FileDescriptor>(
    unresolvedFileIds.map(fileId => ({
      endpoint: `/files/${fileId}`,
      method: 'GET',
      queryKey: ['files', fileId],
      enabled: true,
    })),
  );

  const resourceNames: Record<string, string> = { ...knownNames };
  unresolvedFileIds.forEach((fileId, i) => {
    const data = fileQueries[i]?.data;
    if (data) resourceNames[fileId] = data.name;
  });

  const { fileInputRef, uploadingFiles, uploadProgress, uploadErrors, handleFiles } = useAdditionalResourceUpload(resource => {
    setKnownNames(prev => ({ ...prev, [resource.file_id]: resource.name }));
    onChange([...value, { file_id: resource.file_id }]);
  });

  const handleRemove = (fileId: string) => {
    onChange(value.filter(r => r.file_id !== fileId));
  };

  return (
    <div className={styles.AdditionalResourcesUpload}>
      <FileUploadBox
        files={uploadingFiles}
        uploadProgress={uploadProgress}
        fileInputRef={fileInputRef}
        caption={t('datasets.mappings.details.additional_resources_upload_caption')}
        handleFiles={handleFiles}
        accept={ADDITIONAL_RESOURCE_EXTENSIONS.join(', ')}
        errorMessage={uploadErrors}
      />
      {value.length > 0 && (
        <div className={styles.AddedResources}>
          <p className={styles.AddedResourcesTitle}>{t('datasets.mappings.details.additional_resources_added_title')}</p>
          <ul className={styles.ResourceList}>
            {value.map(({ file_id: fileId }) => (
              <li key={fileId} className={styles.ResourceItem}>
                <FileIcon width={20} height={20} className={styles.FileIcon} />
                <span className={styles.ResourceName}>{resourceNames[fileId] ?? fileId}</span>
                <span className={styles.ResourceType}>{t('datasets.mappings.details.additional_resources_file_badge')}</span>
                <button
                  type="button"
                  className={styles.RemoveButton}
                  onClick={() => handleRemove(fileId)}
                  aria-label={t('datasets.mappings.details.additional_resources_remove_aria')}
                >
                  <CrossIcon width={20} height={20} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
