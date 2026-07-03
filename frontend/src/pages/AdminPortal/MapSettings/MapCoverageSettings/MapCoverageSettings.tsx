import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import WarningIcon from 'assets/icons/warning-icon.svg?react';
import { RadioButton, ToggleButton } from 'components/UI';

import styles from './MapCoverageSettings.module.scss';

interface Props {
  isDaiEnabled: boolean;
  defaultValue: boolean;
  onActivationChange: () => void;
  onDefaultValueChange: (isActive: boolean) => void;
}

export function MapCoverageSettings({ isDaiEnabled, defaultValue, onActivationChange, onDefaultValueChange }: Props) {
  const { t } = useTranslation('admin');

  const handleDefaultValueChange = useCallback(
    (value: string) => {
      onDefaultValueChange(value === 'active');
    },
    [onDefaultValueChange],
  );

  return (
    <div className={styles.MapCoverageSettings}>
      <div className={styles.Text}>
        <h3 className={styles.Title}>{t('map_settings.coverage.title')}</h3>
        <p className={styles.Subtitle}>{t('map_settings.coverage.subtitle')}</p>
      </div>
      <div className={styles.DaiSettings}>
        <div className={styles.Main}>
          <div className={styles.Text}>
            <h4 className={styles.Title}>{t('map_settings.coverage.settings_title')}</h4>
            <p className={styles.Subtitle}>{t('map_settings.coverage.settings_subtitle')}</p>
          </div>
          <ToggleButton checked={isDaiEnabled} onChange={onActivationChange} />
        </div>
        {isDaiEnabled && (
          <div className={styles.DefaultSection}>
            <div className={styles.DefaultSectionItem}>
              <div className={styles.Text}>
                <h4 className={styles.Title}>{t('map_settings.coverage.default_value.description_title')}</h4>
                <p className={styles.Subtitle}>{t('map_settings.coverage.default_value.description_message')}</p>
              </div>
            </div>
            <div className={styles.DefaultSectionItem}>
              <RadioButton name="default_value" value="active" isChecked={defaultValue} onChange={handleDefaultValueChange} />
              <div className={styles.Text}>
                <h4 className={styles.Title}>{t('map_settings.coverage.default_value.active_label')}</h4>
                <p className={styles.Subtitle}>{t('map_settings.coverage.default_value.active_message')}</p>
              </div>
            </div>
            <div className={styles.DefaultSectionItem}>
              <RadioButton name="default_value" value="inactive" isChecked={!defaultValue} onChange={handleDefaultValueChange} />
              <div className={styles.Text}>
                <h4 className={styles.Title}>{t('map_settings.coverage.default_value.inactive_label')}</h4>
                <p className={styles.Subtitle}>{t('map_settings.coverage.default_value.inactive_message')}</p>
              </div>
            </div>
          </div>
        )}
        <div className={styles.WarningBanner}>
          <WarningIcon data-testid="warning-icon" className={styles.WarningIcon} />
          <div className={styles.Text}>
            <h4 className={styles.Title}>{t('map_settings.coverage.warning_title')}</h4>
            <p className={styles.Subtitle}>{t('map_settings.coverage.warning_subtitle')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
