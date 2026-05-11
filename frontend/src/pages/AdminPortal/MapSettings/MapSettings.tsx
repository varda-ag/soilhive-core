import { useCallback, useState } from 'react';
import styles from './MapSettings.module.scss';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/UI';
import SoilhiveSimpleMap from '../../../components/Map/SoilhiveSimpleMap';
import useTheme from '../../../hooks/useTheme';

export function MapSettings() {
  const { t } = useTranslation('admin');
  const { themeConfig, saveInitialBbox } = useTheme();
  const [bbox, setBbox] = useState<number[]>(themeConfig.initialBbox);

  const onSave = useCallback(() => {
    saveInitialBbox(bbox);
  }, [bbox, saveInitialBbox]);

  return (
    <div className={styles.Layout}>
      <main className={styles.Content}>
        <h3>{t('map_settings.subtitle')}</h3>
        <p>{t('map_settings.description')}</p>
        <div className={styles.Map}>
          <SoilhiveSimpleMap
            initialViewBoundingBox={themeConfig.initialBbox}
            showNavigation={true}
            showGeocoder={true}
            onBboxChange={bbox => setBbox(bbox)}
          />
        </div>
        <Button onClick={onSave}>{t('map_settings.save')}</Button>
      </main>
    </div>
  );
}
