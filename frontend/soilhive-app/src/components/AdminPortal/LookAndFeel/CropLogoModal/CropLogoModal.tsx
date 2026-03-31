import { useTranslation } from 'react-i18next';
import { CropModal } from 'components/CropModal/CropModal';

const LOGO_WIDTH = 668;
const LOGO_HEIGHT = 236;

interface Props {
  isModalOpened: boolean;
  imageSrc: string | null;
  onCrop: (file: File) => void;
  onCancel: () => void;
}

export function CropLogoModal({ isModalOpened, imageSrc, onCrop, onCancel }: Props) {
  const { t } = useTranslation('admin');

  return (
    <CropModal
      isModalOpened={isModalOpened}
      imageSrc={imageSrc}
      outputWidth={LOGO_WIDTH}
      outputHeight={LOGO_HEIGHT}
      fileName="logo.png"
      headerText={t('look_and_feel.logo.crop.title')}
      cancelText={t('look_and_feel.logo.crop.cancel_button')}
      continueText={t('look_and_feel.logo.crop.upload_button')}
      onCrop={onCrop}
      onCancel={onCancel}
    />
  );
}
