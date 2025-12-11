/* eslint-disable */
import { useEffect, useRef, useState } from 'react';
import PolygonIcon from 'assets/icons/polygon-icon.svg?react';
import ArrowDownIcon from 'assets/icons/arrow-down-icon.svg?react';
import PencilIcon from 'assets/icons/pencil-icon.svg?react';
import UploadIcon from 'assets/icons/upload-icon.svg?react';

interface SoilhiveMapToolbarProps {
  onDrawClick: () => void;
  onUploadClick: () => {};
}

export default function SoilhiveMapToolbar({ onDrawClick, onUploadClick }: SoilhiveMapToolbarProps) {
  const [open, setOpen] = useState(false);
  const selectionButtonRef = useRef<HTMLButtonElement>(null);
  const selectionListRef = useRef<HTMLDivElement>(null);

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
    return (() => {
      window.removeEventListener('click', onWindowClick);
    });
  }, []);

  return (
    <div className="soilhive-map-toolbar">
      <input type="search" placeholder="Country, coordinates or H3cellID" />
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
            onUploadClick();
          }}
        >
          <UploadIcon />
          Upload a polygon
        </button>
      </div>
    </div>
  );
}
