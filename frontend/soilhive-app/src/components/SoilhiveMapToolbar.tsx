import { useState } from 'react';
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

  return (
    <div className="soilhive-map-toolbar">
      <input type="search" placeholder="Country, coordinates or H3cellID" />
      <button onClick={() => {
        setOpen(!open);
      }}>
        <span className="text-container">
          <PolygonIcon className="polygon" />
          Polygon
        </span>
        <span className="arrow-container">
          <ArrowDownIcon className="arrow" />
        </span>        
      </button>
      <div className={`selection-list${ open ? ' open' : '' }`}>
        <button onClick={() => {
          setOpen(false);
          onDrawClick();
        }}>
            <PencilIcon />Draw a polygon
        </button>
        <button onClick={() => {
          setOpen(false);
          onUploadClick();
        }}>
          <UploadIcon />Upload a polygon
        </button>
      </div>
    </div>
  );
}