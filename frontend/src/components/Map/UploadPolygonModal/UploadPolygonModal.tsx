import { Trans, useTranslation } from 'react-i18next';
import type { Polygon, MultiPolygon } from 'geojson';

import LightbulbIcon from 'assets/icons/small-lightbulb-icon.svg?react';
import { Dialog, FileUploadBox } from 'components/UI';

import styles from './UploadPolygonModal.module.scss';
import { useCallback, useRef, useState, type RefObject } from 'react';
import { parseGeoJSONFile } from 'utilities/parseGeoJSONFile';

interface Props {
  visible: boolean;
  onUpload: (geometry: Polygon | MultiPolygon) => void;
  onClose: () => void;
}

export function UploadPolygonModal({ visible, onUpload, onClose }: Props) {
  const { t } = useTranslation('availability');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string>('');

  const handleFileUpload = useCallback(
    async (files: FileList | File[] | null) => {
      setUploadError('');
      const file = files?.[0];
      if (!file) return;

      const result = await parseGeoJSONFile(file);
      if (result.error) {
        setUploadError(result.error.message);
        (fileInputRef.current as HTMLInputElement).value = '';
        return;
      }

      onUpload(result.polygon);
      onClose();
    },
    [onUpload, onClose],
  );

  return (
    <Dialog
      visible={visible}
      header={t('upload_polygon_modal.title')}
      className={styles.UploadPolygonModal}
      contentClassName={styles.UploadPolygonModalContent}
      headerClassName={styles.UploadPolygonModalHeader}
      hideButtons={true}
      closeOnOverlay={true}
      onClose={onClose}
    >
      <>
        <div className={styles.UploadBoxWrapper}>
          <p className={styles.UploadBoxMessage}>{t('upload_polygon_modal.message')}</p>
          <FileUploadBox
            fileInputRef={fileInputRef as RefObject<HTMLInputElement>}
            handleFiles={handleFileUpload}
            caption={t('upload_polygon_modal.supported_formats')}
            isSingleFileUpload
            errorMessage={uploadError}
          />
        </div>
        <div className={styles.Tip}>
          <LightbulbIcon /> <p>{t('upload_polygon_modal.tip')}</p>
        </div>
        <div className={styles.Divider} />
        <ul className={styles.List}>
          <li className={styles.ListItem}>
            <Trans
              t={t}
              i18nKey="upload_polygon_modal.list.0"
              components={{
                strong: <strong />,
              }}
            />
          </li>
          <li className={styles.ListItem}>
            <Trans
              t={t}
              i18nKey="upload_polygon_modal.list.1"
              components={{
                strong: <strong />,
              }}
            />
          </li>
          <li className={styles.ListItem}>
            <Trans t={t} i18nKey="upload_polygon_modal.list.2" />
          </li>
        </ul>
      </>
    </Dialog>
  );
}
