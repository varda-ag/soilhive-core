import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from 'components/UI';
import SoilhiveSimpleMap from 'components/Map/SoilhiveSimpleMap';
import { MapCoverageSettings } from './MapCoverageSettings/MapCoverageSettings';
import useTheme from 'hooks/useTheme';

import styles from './MapSettings.module.scss';

export function MapSettings() {
  const { t } = useTranslation('admin');
  const { themeConfig, saveMapSettings } = useTheme();
  const [bbox, setBbox] = useState<number[]>(themeConfig.initialBbox);
  const [isDaiEnabled, setIsDaiEnabled] = useState<boolean>(!!themeConfig.daiConfig?.isEnabled);
  const [defaultDaiValue, setDefaultDaiValue] = useState<boolean>(!!themeConfig.daiConfig?.defaultValue);

  const onSave = useCallback(() => {
    saveMapSettings(bbox, {
      isEnabled: isDaiEnabled,
      defaultValue: defaultDaiValue,
    });
  }, [bbox, isDaiEnabled, defaultDaiValue, saveMapSettings]);

  const onDaiActivationChange = useCallback(() => {
    setIsDaiEnabled(prevValue => !prevValue);
  }, []);

  const onDaiDefaultValueChange = useCallback((isActive: boolean) => {
    setDefaultDaiValue(isActive);
  }, []);

  return (
    <div className={styles.Layout}>
      <div className={styles.ContentWrapper}>
        <main className={styles.Content}>
          <div className={styles.TextBlock}>
            <h3 className={styles.Title}>{t('map_settings.subtitle')}</h3>
            <p className={styles.Subtitle}>{t('map_settings.description')}</p>
          </div>
          <div className={styles.Map}>
            <SoilhiveSimpleMap
              initialViewBoundingBox={themeConfig.initialBbox}
              showNavigation={true}
              showGeocoder={true}
              onBboxChange={bbox => setBbox(bbox)}
            />
          </div>
          <MapCoverageSettings
            isDaiEnabled={isDaiEnabled}
            defaultValue={defaultDaiValue}
            onActivationChange={onDaiActivationChange}
            onDefaultValueChange={onDaiDefaultValueChange}
          />
        </main>
        <div className={styles.Footer}>
          <Button onClick={onSave}>{t('map_settings.save')}</Button>
        </div>
      </div>
    </div>
  );
}
