import { useEffect, useRef, useState } from 'react';
import classnames from 'classnames';
import SmallPolygonIcon from 'assets/icons/small-polygon-icon.svg?react';
import ArrowDownIcon from 'assets/icons/arrow-down-icon.svg?react';
import PencilIcon from 'assets/icons/pencil-icon.svg?react';
import UploadIcon from 'assets/icons/small-upload-icon.svg?react';
import useDevice from 'hooks/useDevice';
import { useTranslation } from 'react-i18next';

interface SoilhiveMapToolbarProps {
  visible: boolean;
  onDrawClick: () => void;
  /**
   * Optional — this toolbar no longer owns the "upload via modal" flow itself (that pulls in
   * UploadPolygonModal -> Dialog -> primereact, which isn't vendored to plugins). When provided,
   * a "Upload a polygon" option appears in the dropdown and this is called on click; the caller
   * (e.g. the host page) owns showing whatever upload UI it wants. Omit to hide the option
   * entirely — the map's drag-and-drop upload (via SoilhiveMapRef.onUpload) is unaffected either
   * way.
   */
  onUploadClick?: () => void;
}

export default function SoilhiveMapToolbar({ visible, onDrawClick, onUploadClick }: SoilhiveMapToolbarProps) {
  const { t } = useTranslation('availability');
  const [open, setOpen] = useState(false);
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
        {onUploadClick && (
          <button
            onClick={() => {
              setOpen(false);
              onUploadClick();
            }}
          >
            <UploadIcon />
            {t('map.upload_a_polygon')}
          </button>
        )}
      </div>
    </div>
  );
}
