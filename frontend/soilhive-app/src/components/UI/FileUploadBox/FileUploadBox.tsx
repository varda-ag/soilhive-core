import type { ChangeEvent } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import classnames from 'classnames';
import type { DropAreaBond } from 'react-use/lib/useDropArea';

import { ProgressBar } from '../ProgressBar/ProgressBar';
import { FormMessage } from '../FormMessage/FormMessage';
import UploadIcon from 'assets/icons/big-cloud-upload-icon.svg?react';

import styles from './FileUploadBox.module.scss';
import useDropArea from 'react-use/lib/useDropArea';

type FilesUploadProgress = {
  [key: string]: number[];
};

interface Props {
  files?: File[];
  uploadProgress?: FilesUploadProgress;
  bond?: DropAreaBond;
  fileInputRef?: React.RefObject<HTMLInputElement | null>;
  disabled?: boolean;
  caption?: string;
  errorMessage?: string | null;
  isSingleFileUpload?: boolean;
  handleFiles: (files: FileList | File[] | null) => void;
}

export function FileUploadBox({
  files = [],
  uploadProgress,
  fileInputRef,
  disabled,
  caption,
  errorMessage,
  isSingleFileUpload,
  handleFiles,
}: Props) {
  const { t } = useTranslation('common');

  const [bond] = useDropArea({
    onFiles: files => handleFiles(files),
  });

  return (
    <div>
      <label
        data-testid="sh-ui-fileuploadbox"
        className={classnames(styles.FileUploadBox, disabled && styles.Disabled, !!errorMessage && styles.Error)}
        htmlFor="fileUploadInput"
        {...bond}
      >
        <div className={styles.DropArea} data-testid="sh-ui-fileuploadbox-droparea">
          <UploadIcon />
          {files.length ? (
            <div className={styles.ProgressList}>
              {files.map(file => (
                <div key={file.name}>
                  <p className={styles.Title}>
                    {t('components.file_upload_box.uploading')}: {file.name}
                  </p>
                  <ProgressBar progress={uploadProgress?.[file.name] || []} />
                </div>
              ))}
            </div>
          ) : (
            <>
              <p className={styles.Title}>
                <Trans
                  t={t}
                  i18nKey="components.file_upload_box.title"
                  components={{
                    span: <span />,
                  }}
                />
              </p>
              <p className={styles.Caption}>{caption}</p>
            </>
          )}
          <input
            id="fileUploadInput"
            data-testid="upload-input"
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            disabled={disabled}
            onChange={(e: ChangeEvent<HTMLInputElement>) => handleFiles(e.target.files)}
            multiple={!isSingleFileUpload}
          />
        </div>
      </label>
      {!!errorMessage && <FormMessage message={errorMessage} type="error" />}
    </div>
  );
}
