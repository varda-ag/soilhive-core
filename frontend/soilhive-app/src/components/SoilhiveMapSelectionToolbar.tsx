/* eslint-disable */
import ResetIcon from 'assets/icons/small-reset-icon.svg?react';
import MarkerIcon from 'assets/icons/small-marker-icon.svg?react';
import PlusIcon from 'assets/icons/small-plus-icon.svg?react';
import { Button } from './UI';

interface SoilhiveMapSelectionToolbarProps {
  area?: number;
  onCancel: () => {};
  onReset: () => {};
  onDrawAnother: () => {};
  onShowResults: () => {};
}

export default function SoilhiveMapSelectionToolbar({ area = 0, onCancel, onReset, onDrawAnother, onShowResults }: SoilhiveMapSelectionToolbarProps) {
  return (
    <div className="soilhive-map-selection-toolbar">      
      <Button size="tiny" type="tertiary" onClick={onReset} className="reset-button"><ResetIcon />Reset</Button>
      <Button size="tiny" type="tertiary" onClick={onCancel}>Cancel</Button>
      <Button size="tiny" type="secondary" onClick={onDrawAnother} isDisabled={true}><PlusIcon />Draw another area</Button>
      <Button size="tiny" type="primary" onClick={onShowResults}><MarkerIcon />Show results</Button>
      <div className="selection-area">{area} km²</div>
    </div>
  );
}
