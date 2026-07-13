/* eslint-disable */
import { useEffect, useRef, useState } from 'react';
import classnames from 'classnames';
import SmallPolygonIcon from 'assets/icons/small-polygon-icon.svg?react';
import ArrowDownIcon from 'assets/icons/arrow-down-icon.svg?react';
import PencilIcon from 'assets/icons/pencil-icon.svg?react';
import UploadIcon from 'assets/icons/small-upload-icon.svg?react';
import type { Polygon, MultiPolygon } from 'geojson';
import useDevice from 'hooks/useDevice';
import useNotifications from 'hooks/useNotifications';
import { useTranslation } from 'react-i18next';
import { parseGeoJSONFile } from 'utilities/parseGeoJSONFile';

interface SoilhiveMapToolbarProps {
  visible: boolean;
  onDrawClick: () => void;
  onUpload: (geometry: Polygon | MultiPolygon) => void;
}

export default function SoilhiveMapToolbar({ visible, onDrawClick, onUpload }: SoilhiveMapToolbarProps) {
  const { t } = useTranslation('availability');
  const [open, setOpen] = useState(false);
  const selectionButtonRef = useRef<HTMLButtonElement>(null);
  const selectionListRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { isMobileLayout } = useDevice();
  const { showNotification } = useNotifications();

  const onWindowClick = (event: PointerEvent) => {
    const target = event.target as Node;
    const insideSelectionButton = selectionButtonRef.current?.contains(target);
    const insideSelectionList = selectionListRef.current?.contains(target);
    if (!insideSelectionButton && !insideSelectionList) {
      setOpen(false);
    }
  };

  useEffect(() => {
    window.addEventListener('click', onWindowClick);
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.geojson,.json';
    fileInput.onchange = async function onFileInputChange(event) {
      const file = (event as any).target?.files?.item(0);
      if (!file) {
        showNotification({ id: 'no-file-uploaded', title: 'Upload failed', message: 'No file uploaded' });
        return;
      }

      // Resets the fileInput otherwise if you upload again the same file the onchange won't trigger
      fileInput.value = '';

      const result = await parseGeoJSONFile(file);
      if (result.error) {
        showNotification({ id: result.error.id, title: 'Upload failed', message: result.error.message });
        return;
      }

      onUpload(result.polygon);
    };
    fileInputRef.current = fileInput;
    return () => {
      window.removeEventListener('click', onWindowClick);
      if (fileInputRef.current) {
        fileInputRef.current.onchange = null;
        fileInputRef.current = null;
      }
    };
  }, []);

  return (
    <div className={classnames('soilhive-map-toolbar', { hidden: !visible })}>
      {!isMobileLayout && (
        <button
          ref={selectionButtonRef}
          onClick={() => {
            setOpen(!open);
          }}
        >
          <span className="text-container">
            <SmallPolygonIcon className="polygon" />
            <span className="text-only">{t('map.polygon_button')}</span>
          </span>
          <span className="arrow-container">
            <ArrowDownIcon className="arrow" />
          </span>
        </button>
      )}
      <div ref={selectionListRef} className={`selection-list${open ? ' open' : ''}`}>
        <button
          onClick={() => {
            setOpen(false);
            onDrawClick();
          }}
        >
          <PencilIcon />
          {t('map.draw_a_polygon')}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            fileInputRef.current?.click();
          }}
        >
          <UploadIcon />
          {t('map.upload_a_polygon')}
        </button>
      </div>
    </div>
  );
}
