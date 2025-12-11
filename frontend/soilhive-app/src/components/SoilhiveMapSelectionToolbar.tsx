/* eslint-disable */
import ResetIcon from 'assets/icons/reset-gray-icon.svg?react';
import MarkerIcon from 'assets/icons/marker-white-icon.svg?react';
import PlusIcon from 'assets/icons/plus-green-icon.svg?react';
import InfoIcon from 'assets/icons/info-gray-icon.svg?react';
import { Button } from './UI';

interface SoilhiveMapSelectionToolbarProps {
  onCancel: () => {};
  onReset: () => {};
  onDrawAnother: () => {};
  onShowResults: () => {};
}

export default function SoilhiveMapSelectionToolbar({ onCancel, onReset, onDrawAnother, onShowResults }: SoilhiveMapSelectionToolbarProps) {
  return (
    <div className="soilhive-map-selection-toolbar">      
      <Button size="tiny" type="tertiary" onClick={onReset}><ResetIcon />Reset</Button>
      <Button size="tiny" type="tertiary" onClick={onCancel}>Cancel</Button>
      <Button size="tiny" type="secondary" onClick={onDrawAnother}><PlusIcon />Draw another area</Button>
      <Button size="tiny" type="primary" onClick={onShowResults}><MarkerIcon />Show results</Button>
      <div className="selection-area">0 km2 <InfoIcon /></div>
    </div>
  );
}
