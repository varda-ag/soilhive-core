import { useTranslation } from 'react-i18next';
import { Popup, type LngLat } from 'react-map-gl/maplibre';
import { type Offset } from 'maplibre-gl';

import Flower from 'assets/images/flower.svg?react';
import CloseIcon from 'assets/icons/small-cross-icon.svg?react';
import { AreaInfoContent } from 'components/Map/AreaInfo/AreaInfoContent/AreaInfoContent';
import type { MapSelection } from '../../../../contexts/AvailabilityMapContext';

import styles from './AreaInfoPopup.module.scss';

interface Props {
  selectedPoint: LngLat;
  selection: MapSelection;
  locationName?: string;
  onClose: () => void;
}

export function AreaInfoPopup({ selectedPoint, selection, locationName, onClose }: Props) {
  const { t } = useTranslation('availability');

  return (
    <Popup
      anchor="left"
      longitude={selectedPoint.lng}
      latitude={selectedPoint.lat}
      closeOnClick={false}
      closeButton={false}
      className={styles.AreaInfoPopup}
      onClose={onClose}
      offset={
        {
          left: [0, 0],
          top: [0, 0],
          'top-left': [0, 0],
          bottom: [0, 0],
        } as Offset
      }
    >
      <div className={styles.AreaInfoPopupHeader}>
        <Flower className={styles.AreaInfoPopupHeaderIcon} />
        <div className={styles.AreaInfoPopupHeaderTitle}>{t('map_popup.title')}</div>
        <button data-testid="sh-areainfopopup-close" className={styles.AreaInfoCloseButton} onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <AreaInfoContent selection={selection} locationName={locationName} />
    </Popup>
  );
}
