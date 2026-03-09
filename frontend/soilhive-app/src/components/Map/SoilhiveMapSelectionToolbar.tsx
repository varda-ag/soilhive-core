/* eslint-disable */
import ResetIcon from 'assets/icons/small-reset-icon.svg?react';
import MarkerIcon from 'assets/icons/small-marker-icon.svg?react';
import PlusIcon from 'assets/icons/small-plus-icon.svg?react';
import { Button } from '../UI';
import { useTranslation } from 'react-i18next';

interface SoilhiveMapSelectionToolbarProps {
  area?: number;
  onCancel: () => void;
  onReset: () => void;
  onDrawAnother: () => void;
  onShowResults: () => void;
}

export default function SoilhiveMapSelectionToolbar({ area = 0, onCancel, onReset, onDrawAnother, onShowResults }: SoilhiveMapSelectionToolbarProps) {
  const { t } = useTranslation('availability');
  return (
    <div className="soilhive-map-selection-toolbar">
      <Button size="tiny" type="tertiary" onClick={onReset} className="reset-button">
        <ResetIcon />
        {t('map_selection_toolbar.reset')}
      </Button>
      <Button size="tiny" type="tertiary" onClick={onCancel}>
        {t('map_selection_toolbar.cancel')}
      </Button>
      <Button className="draw-another-button" size="tiny" type="secondary" onClick={onDrawAnother} isDisabled={true}>
        <PlusIcon />
        {t('map_selection_toolbar.draw_another_area')}
      </Button>
      <Button className="show-results-button" size="tiny" type="primary" onClick={onShowResults}>
        <MarkerIcon />
        {t('map_selection_toolbar.show_results')}
      </Button>
      <div className="selection-area">{area} km²</div>
      <div className="break"></div>
      <Button className="draw-another-button-mobile" size="tiny" type="secondary" onClick={onDrawAnother} isDisabled={true}>
        <PlusIcon />
        {t('map_selection_toolbar.draw_another_area')}
      </Button>
    </div>
  );
}
