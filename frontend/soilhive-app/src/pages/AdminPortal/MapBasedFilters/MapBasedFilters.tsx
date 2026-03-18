import classNames from 'classnames';
import { useTranslation } from 'react-i18next';

import ServerIcon from 'assets/icons/server-check-icon.svg?react';
import SettingsIcon from 'assets/icons/settings-icon.svg?react';
import WrenchIcon from 'assets/icons/wrench-icon.svg?react';

import styles from './MapBasedFilters.module.scss';
import { useRaster } from 'hooks/useRaster';
import type { RasterFilterCategory } from 'types/backend';
import { ExpandableText } from 'components/UI/ExpandableText/ExpandableText';

export function MapBasedFilters() {
  const { t } = useTranslation('admin');
  const { allCategories: allRasterCategories } = useRaster();

  return (
    <div className={styles.MapBasedFilters}>
      {/* Section 1: Why configuration */}
      <section className={styles.Card}>
        <ServerIcon className={styles.Icon} />
        <div className={styles.Content}>
          <h3>{t('filters.intro.title')}</h3>
          <p>{t('filters.intro.description')}</p>
        </div>
      </section>

      {/* Section 2: The Filters */}
      <section className={styles.Card}>
        <SettingsIcon className={styles.Icon} />
        <div className={styles.Content}>
          <h3>{t('filters.list.title')}</h3>

          <div className={styles.FilterList}>
            <div className={styles.FilterItem}>
              <h4>{t('filters.agroecological_zones.name')}</h4>
              <ExpandableText text={t('filters.agroecological_zones.description')} />
            </div>

            <div className={styles.FilterItem}>
              <h4>{t('filters.land_cover.name')}</h4>
              <ExpandableText text={t('filters.land_cover.description')} />
            </div>

            <div className={styles.FilterItem}>
              <h4>{t('filters.soil_groups.name')}</h4>
              <ExpandableText text={t('filters.soil_groups.description')} />
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Activation & State */}
      <section className={styles.Card}>
        <WrenchIcon className={styles.Icon} />
        <div className={styles.Content}>
          <div className={styles.ActivationSection}>
            <h3>{t('filters.activation.title')}</h3>
            <p>{t('filters.activation.description')}</p>
            <a href="https://docs.example.com" target="_blank" rel="noreferrer" className={styles.DocLink}>
              https://docs.example.com/map-filters-setup
            </a>

            <div className={styles.StatusTitle}>{t('filters.activation.status_title')}</div>

            {allRasterCategories?.map((category: RasterFilterCategory) => (
              <div key={`state-${category.id}`} className={styles.StatusRow} data-testid={`status-row-${category.id}`}>
                <span className={styles.Label} data-testid="status-label">
                  {category.name}
                </span>
                <div
                  className={classNames(styles.StatusBox, {
                    [styles.Active]: category.enabled,
                    [styles.Inactive]: !category.enabled,
                  })}
                  data-testid="status-box"
                >
                  {category.enabled ? t('filters.common.active') : t('filters.common.not_active')}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
