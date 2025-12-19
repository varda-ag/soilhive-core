/* eslint-disable */
import { useEffect, useRef, useState } from 'react';
import PolygonIcon from 'assets/icons/polygon-icon.svg?react';
import ArrowDownIcon from 'assets/icons/arrow-down-icon.svg?react';
import PencilIcon from 'assets/icons/pencil-icon.svg?react';
import UploadIcon from 'assets/icons/upload-icon.svg?react';
import { booleanValid, type AllGeoJSON } from '@turf/turf';

interface SoilhiveMapToolbarProps {
  onDrawClick: () => void;
  onUpload: (geojson: AllGeoJSON) => {};
}

export default function SoilhiveMapToolbar({ onDrawClick, onUpload }: SoilhiveMapToolbarProps) {
  const [open, setOpen] = useState(false);
  const selectionButtonRef = useRef<HTMLButtonElement>(null);
  const selectionListRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function onWindowClick(event: PointerEvent) {
    const target = event.target as Node;
    const insideSelectionButton = selectionButtonRef.current?.contains(target);
    const insideSelectionList = selectionListRef.current?.contains(target);
    if(!insideSelectionButton && !insideSelectionList) {
      setOpen(false);
    }
  }

  useEffect(() => {
    window.addEventListener('click', onWindowClick);
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.geojson';
    fileInput.onchange = async function onFileInputChange(event) {
      const file = (event as any).target?.files?.item(0);;
      if(!file) {
        console.error('No file uploaded');
        return;
      }
      const text = await file.text();
      if(!text) {
        console.error('Cannot read uploaded file as text');
        return;
      }
      let json;
      try {
        json = JSON.parse(text);
      } catch {}
      if(!json) {
        console.error('Cannot read uploaded file as JSON');
        return;
      }
      if(!booleanValid(json)) {
        console.error('Uploaded file does not contain valid GeoJSON');
        return;
      }
      onUpload(json);
    };
    fileInputRef.current = fileInput;
    return (() => {
      window.removeEventListener('click', onWindowClick);
      if(fileInputRef.current) {
        fileInputRef.current.onchange = null;
        fileInputRef.current = null;
      }
    });
  }, []);

  return (
    <div className="soilhive-map-toolbar">
      <button
        ref={selectionButtonRef}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <span className="text-container">
          <PolygonIcon className="polygon" />
          Polygon
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
          Draw a polygon
        </button>
        <button
          onClick={() => {
            setOpen(false);
            fileInputRef.current?.click();
          }}
        >
          <UploadIcon />
          Upload a polygon
        </button>
      </div>
    </div>
  );
}
