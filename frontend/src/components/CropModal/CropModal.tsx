import { useCallback, useMemo, useState } from 'react';
import { Cropper, Dialog, RangeSlider } from 'components/UI';
import { useTranslation } from 'react-i18next';
import { type Area } from 'react-easy-crop';
import { getCroppedFile } from '../../utilities/cropper';

import styles from './CropModal.module.scss';

interface Props {
  isModalOpened: boolean;
  imageSrc: string | null;
  outputWidth: number;
  outputHeight: number;
  fileName?: string;
  headerText: string;
  secondaryText?: string;
  primaryText?: string;
  onCrop: (file: File) => void;
  onCancel: () => void;
}

export function CropModal({
  isModalOpened,
  imageSrc,
  outputWidth,
  outputHeight,
  fileName,
  headerText,
  secondaryText,
  primaryText,
  onCrop,
  onCancel,
}: Props) {
  const { t } = useTranslation('admin');

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const aspect = useMemo(() => outputWidth / outputHeight, [outputWidth, outputHeight]);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const resetCropper = useCallback(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  }, []);

  const handleConfirmCrop = useCallback(async () => {
    if (!imageSrc || !croppedAreaPixels) return;

    try {
      const croppedFile = await getCroppedFile(imageSrc, croppedAreaPixels, outputWidth, outputHeight, fileName);
      resetCropper();
      onCrop(croppedFile);
    } catch (e) {
      console.error(e);
    }
  }, [imageSrc, croppedAreaPixels, outputWidth, outputHeight, fileName, resetCropper, onCrop]);

  const handleCancel = useCallback(() => {
    resetCropper();
    onCancel();
  }, [onCancel, resetCropper]);

  return (
    <Dialog
      visible={isModalOpened}
      header={headerText}
      removeTransition
      secondaryText={secondaryText}
      primaryText={primaryText}
      contentClassName={styles.CroppDialog}
      onPrimary={handleConfirmCrop}
      onSecondary={handleCancel}
    >
      {imageSrc && (
        <>
          <div style={{ position: 'relative', width: '504px', height: '294px' }}>
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              minZoom={0}
              aspect={aspect}
              restrictPosition={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>
          <div className={styles.ZoomBlock}>
            <p>{t('look_and_feel.logo.crop.zoom_label')}</p>
            <RangeSlider min={0} max={3} step={0.1} initialValue={zoom} showButtons onChange={setZoom} />
          </div>
        </>
      )}
    </Dialog>
  );
}
