/* eslint-disable */
import SearchIcon from 'assets/icons/small-search-icon.svg?react';
import ResetIcon from 'assets/icons/small-reset-icon.svg?react';
import CrossIcon from 'assets/icons/small-cross-icon.svg?react';
import { Button } from '../UI';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';

export type SoilhiveMapSelectionToolbarMode = 'drawing' | 'clear' | 'search';

interface SoilhiveMapSelectionToolbarProps {
  mode?: SoilhiveMapSelectionToolbarMode;
  onCancel: () => void;
  onReset: () => void;
}

export default function SoilhiveMapSelectionToolbar({ mode = 'drawing', onCancel, onReset }: SoilhiveMapSelectionToolbarProps) {
  const { t } = useTranslation('availability');
  return (
    <div className={classNames('soilhive-map-selection-toolbar', { drawing: mode === 'drawing' })}>
      { mode === 'drawing' &&
        <>
          <Button size="tiny" type="tertiary" onClick={onReset} className="reset-button">
            <ResetIcon />
            {t('map_selection_toolbar.reset')}
          </Button>
          <Button size="tiny" type="secondary" onClick={onCancel}>
            {t('map_selection_toolbar.cancel')}
          </Button>
        </>
      }
      { mode === 'clear' && 
        <Button size="tiny" type="tertiary" onClick={onCancel} className="clear-button">
          <CrossIcon />
          {t('map_selection_toolbar.clear_selection')}
        </Button>
      }
      { mode === 'search' && 
        <Button size="tiny" type="tertiary" onClick={onCancel} className="search-area-button">
            <SearchIcon />
            {t('map_selection_toolbar.search_this_area')}
          </Button>
      }
    </div>
  );
}
