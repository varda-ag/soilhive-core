import { useEffect, useRef, useState } from 'react';
import classnames from 'classnames';
import SmallPolygonIcon from 'assets/icons/small-polygon-icon.svg?react';
import ArrowDownIcon from 'assets/icons/arrow-down-icon.svg?react';
import PencilIcon from 'assets/icons/pencil-icon.svg?react';
import UploadIcon from 'assets/icons/small-upload-icon.svg?react';
import type { Polygon, MultiPolygon } from 'geojson';
import useDevice from 'hooks/useDevice';
import { useTranslation } from 'react-i18next';
import { UploadPolygonModal } from './UploadPolygonModal/UploadPolygonModal';

interface SoilhiveMapToolbarProps {
  visible: boolean;
  onDrawClick: () => void;
  onUpload: (geometry: Polygon | MultiPolygon) => void;
}

export default function SoilhiveMapToolbar({ visible, onDrawClick, onUpload }: SoilhiveMapToolbarProps) {
  const { t } = useTranslation('availability');
  const [open, setOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const selectionButtonRef = useRef<HTMLButtonElement>(null);
  const selectionListRef = useRef<HTMLDivElement>(null);

  const { isMobileLayout } = useDevice();

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

    return () => {
      window.removeEventListener('click', onWindowClick);
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
            setIsUploadOpen(true);
          }}
        >
          <UploadIcon />
          {t('map.upload_a_polygon')}
        </button>
      </div>
      <UploadPolygonModal visible={isUploadOpen} onUpload={onUpload} onClose={() => setIsUploadOpen(false)} />
    </div>
  );
}
