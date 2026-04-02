/* eslint-disable */
import { useEffect, useRef, useState } from 'react';
import classnames from 'classnames';
import PolygonIcon from 'assets/icons/polygon-icon.svg?react';
import ArrowDownIcon from 'assets/icons/arrow-down-icon.svg?react';
import PencilIcon from 'assets/icons/pencil-icon.svg?react';
import UploadIcon from 'assets/icons/small-upload-icon.svg?react';
import { check } from '@placemarkio/check-geojson';
import type { Polygon, MultiPolygon } from 'geojson';
import useNotifications from 'hooks/useNotifications';
import { useTranslation } from 'react-i18next';

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

  const { showNotification } = useNotifications();

  const onWindowClick = (event: PointerEvent) => {
    const target = event.target as Node;
    const insideSelectionButton = selectionButtonRef.current?.contains(target);
    const insideSelectionList = selectionListRef.current?.contains(target);
    if (!insideSelectionButton && !insideSelectionList) {
      setOpen(false);
    }
  };

  const isGeometryCompliant = (geometry: any): boolean => {
    return geometry && (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon');
  };

  const selectFirstPolygon = (json: any): Polygon | MultiPolygon | null => {
    if (json.type === 'FeatureCollection') {
      for (const feature of json.features) {
        if (isGeometryCompliant(feature.geometry)) {
          return feature.geometry;
        }
      }
    } else if (json.type === 'Feature') {
      if (isGeometryCompliant(json.geometry)) {
        return json.geometry;
      }
    } else if (isGeometryCompliant(json)) {
      return json;
    }
    return null;
  };

  useEffect(() => {
    setupFileInput(true);
    return () => {
      setupFileInput(false);
    };
  }, [setupFileInput]);

  function setupFileInput(up: boolean) {
    if (!up) {
      window.removeEventListener('click', onWindowClick);
      if (fileInputRef.current) {
        fileInputRef.current.onchange = null;
        fileInputRef.current = null;
      }
      return;
    }
    window.addEventListener('click', onWindowClick);
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.geojson,.json';
    fileInput.onchange = async function onFileInputChange(event) {
      const file = (event as any).target?.files?.item(0);

      const fail = (id: string, message: string) => {
        showNotification({ id, title: t('map.upload_failed'), message });
        fileInput.value = '';
      };

      if (!file) {
        fail('no-file-uploaded', 'No file uploaded');
        return;
      }
      const text = await file.text();
      if (!text) {
        fail('cant-read-file', 'Cannot read uploaded file as text');
        return;
      }
      let json;
      try {
        json = check(text);
      } catch (e) {
        fail('invalid-json', 'Uploaded file does not contain valid GeoJSON');
        return;
      }
      const polygon = selectFirstPolygon(json);
      if (!polygon) {
        fail('invalid-polygon', 'Uploaded file does not contain any valid Polygon or MultiPolygon');
        return;
      }
      onUpload(polygon);
    };
    fileInputRef.current = fileInput;
  }

  return (
    <div className={classnames('soilhive-map-toolbar', { hidden: !visible })}>
      <button
        ref={selectionButtonRef}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <span className="text-container">
          <PolygonIcon className="polygon" />
          <span className="text-only">{t('map.polygon_button')}</span>
        </span>
        <span className="arrow-container">
          <ArrowDownIcon className="arrow" />
        </span>
      </button>
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
