import type { ChangeEvent, ReactNode } from 'react';
import classnames from 'classnames';
import type { DropAreaBond } from 'react-use/lib/useDropArea';

import { ProgressBar } from '../ProgressBar/ProgressBar';
import { FormMessage } from '../FormMessage/FormMessage';
import UploadIcon from '../assets/icons/big-cloud-upload-icon.svg?react';

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
  title?: ReactNode;
  uploadingText?: string;
  processingText?: string;
  errorMessage?: string | string[] | null;
  isSingleFileUpload?: boolean;
  handleFiles: (files: FileList | File[] | null) => void;
  accept?: string;
}

export function FileUploadBox({
  files = [],
  uploadProgress,
  fileInputRef,
  disabled,
  caption,
  title = (
    <>
      Drag and drop a file here or <span>browse</span>
    </>
  ),
  uploadingText = 'Uploading',
  processingText = 'Processing',
  errorMessage,
  isSingleFileUpload,
  handleFiles,
  accept,
}: Props) {
  const [bond] = useDropArea({
    onFiles: files => handleFiles(files),
  });

  const hasError = Array.isArray(errorMessage) ? errorMessage.length > 0 : !!errorMessage;

  return (
    <div>
      <label
        data-testid="sh-ui-fileuploadbox"
        className={classnames(styles.FileUploadBox, disabled && styles.Disabled, hasError && styles.Error)}
        htmlFor="fileUploadInput"
        {...bond}
      >
        <div className={styles.DropArea} data-testid="sh-ui-fileuploadbox-droparea">
          <UploadIcon />
          {files.length ? (
            <div className={styles.ProgressList}>
              {files.map(file => {
                const progress = uploadProgress?.[file.name] || [];
                // Progress counts bytes sent: at 100% the server is still working on the file
                const processing = progress.length > 0 && progress.every(part => part >= 100);
                return (
                  <div key={file.name}>
                    <p className={styles.Title}>
                      {processing ? processingText : uploadingText}: {file.name}
                    </p>
                    <ProgressBar progress={progress} indeterminate={processing} />
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              <p className={styles.Title}>{title}</p>
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
            accept={accept}
          />
        </div>
      </label>
      {Array.isArray(errorMessage)
        ? errorMessage.map((msg, i) => <FormMessage key={i} message={msg} type="error" />)
        : !!errorMessage && <FormMessage message={errorMessage} type="error" />}
    </div>
  );
}
