import { useCallback, useMemo } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import classnames from 'classnames';
import { area } from '@turf/turf';

import PinIcon from 'assets/icons/small-map-pin-icon.svg?react';
import GridIcon from 'assets/icons/small-view-grid-icon.svg?react';
import DownloadIcon from 'assets/icons/small-download-icon.svg?react';

import { Button } from 'components/UI';
import { downloadFile } from '../../../../utilities/download';
import type { MapSelection } from '../../../../contexts/AvailabilityMapContext';

import styles from './AreaInfoContent.module.scss';

interface Props {
  selection: MapSelection;
  locationName?: string;
}

export function AreaInfoContent({ selection, locationName }: Props) {
  const { t } = useTranslation('availability');

  const onDownloadGeoJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify(selection, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const fileName = locationName ? `${locationName}.geojson` : 'location.geojson';

    downloadFile(url, fileName);

    URL.revokeObjectURL(url);
  }, [selection, locationName]);

  const areaCoveredKm2 = useMemo(() => {
    if (!selection.features.length) {
      return;
    }

    return (area(selection.features[0]) / 1_000_000).toFixed(2);
  }, [selection]);

  return (
    <div className={styles.AreaInfoContent}>
      <div className={styles.AreaInfoBody}>
        {locationName && (
          <div className={styles.AreaInfoBodyItem}>
            <div className={styles.AreaInfoBodyItemLabel}>
              <PinIcon /> <span>{t('map_popup.location_label')}</span>
            </div>
            <div className={styles.AreaInfoBodyItemValue}>{locationName}</div>
          </div>
        )}
        {areaCoveredKm2 !== undefined && (
          <div className={styles.AreaInfoBodyItem}>
            <div className={styles.AreaInfoBodyItemLabel}>
              <GridIcon /> <span>{t('map_popup.area_label')}</span>
            </div>
            <div className={classnames(styles.AreaInfoBodyItemValue, styles.AreaInfoAreaValue)}>
              {areaCoveredKm2}
              <span className={styles.AreaInfoAreaUnit}>
                <Trans
                  t={t}
                  i18nKey="map_popup.area_unit"
                  components={{
                    sup: <sup />,
                  }}
                />
              </span>
            </div>
          </div>
        )}
      </div>
      <div className={styles.AreaInfoFooter}>
        <Button type="tertiary" size="tiny" onClick={onDownloadGeoJSON}>
          <DownloadIcon />
          {t('map_popup.download_geojson')}
        </Button>
      </div>
    </div>
  );
}
