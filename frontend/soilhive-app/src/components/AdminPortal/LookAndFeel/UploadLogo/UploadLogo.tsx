import { useCallback, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import classnames from 'classnames';

import { FileUploadBox } from 'components/UI';
import { CropLogoModal } from '../CropLogoModal/CropLogoModal';
import { LogoPreview } from '../LogoPreview/LogoPreview';
import useLookAndFeel from 'hooks/useLookAndFeel';

import styles from './UploadLogo.module.scss';

const SUPPORTED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'svg'];

export function UploadLogo() {
  const { t } = useTranslation('admin');

  const { isLoading, previewLogo, isActualLogo, handleLogoChange, deleteLogo } = useLookAndFeel();

  const [isModalOpened, setIsModalOpened] = useState<boolean>(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourceUrlRef = useRef<string | null>(null);

  const resetFile = useCallback(() => {
    setIsModalOpened(false);
    setImageSrc(null);

    if (sourceUrlRef.current) {
      URL.revokeObjectURL(sourceUrlRef.current);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleFileChange = useCallback(
    (files: FileList | File[] | null) => {
      if (!files?.[0]) return;
      setErrorMessage(null);

      const fileExtension = files[0].name.split('.').pop() || '';
      if (!SUPPORTED_EXTENSIONS.includes(fileExtension.toLowerCase())) {
        setErrorMessage(t('look_and_feel.logo.unsupported_format_error'));

        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }

      if (sourceUrlRef.current) {
        URL.revokeObjectURL(sourceUrlRef.current);
      }

      const nextUrl = URL.createObjectURL(files[0]);
      sourceUrlRef.current = nextUrl;

      setImageSrc(nextUrl);
      setIsModalOpened(true);
    },
    [t],
  );

  const handleCrop = useCallback(
    (croppedFile: File) => {
      handleLogoChange(croppedFile);
      resetFile();
    },
    [handleLogoChange, resetFile],
  );

  const onLogoChange = useCallback(() => {
    (fileInputRef.current as HTMLInputElement).click();
  }, []);

  const onLogoDelete = useCallback(() => {
    setErrorMessage(null);
    deleteLogo();
  }, [deleteLogo]);

  if (isLoading) return null;

  return (
    <div className={styles.UploadLogo}>
      <div className={classnames(styles.FileUploadBoxWrapper, { [styles.Hidden]: previewLogo })}>
        <p className={styles.Label}>{t('look_and_feel.logo.label')}</p>
        <FileUploadBox
          fileInputRef={fileInputRef as RefObject<HTMLInputElement>}
          handleFiles={handleFileChange}
          caption={t('look_and_feel.logo.supported_formats')}
          isSingleFileUpload
          errorMessage={errorMessage}
        />
      </div>

      {previewLogo && (
        <LogoPreview
          previewLogo={previewLogo}
          isActualLogo={isActualLogo}
          errorMessage={errorMessage}
          onChange={onLogoChange}
          onDelete={onLogoDelete}
        />
      )}

      <CropLogoModal isModalOpened={isModalOpened} imageSrc={imageSrc} onCancel={resetFile} onCrop={handleCrop} />
    </div>
  );
}
