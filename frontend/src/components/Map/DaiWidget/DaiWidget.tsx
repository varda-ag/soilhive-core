import { useState, useCallback } from 'react';
import classnames from 'classnames';
import { useTranslation } from 'react-i18next';

import { ToggleButton } from 'components/UI/ToggleButton/ToggleButton';
import { RangeSlider } from 'components/UI/RangeSlider/RangeSlider';
import LayersIcon from 'assets/icons/small-layers-icon.svg?react';
import ChevronIcon from 'assets/icons/dropdown-arrow-down-icon.svg?react';
import ReloadIcon from 'assets/icons/small-reload-icon.svg?react';
import useDevice from 'hooks/useDevice';

import styles from './DaiWidget.module.scss';

const LEGEND_ITEMS = [
  { label: 'legend_very_low', color: '#E8DAD2' },
  { label: 'legend_low', color: '#EFB396' },
  { label: 'legend_medium', color: '#F79E67' },
  { label: 'legend_heigh', color: '#BC001F' },
];

interface Props {
  isEnabled: boolean;
  opacity: number;
  className?: string;
  isLoading?: boolean;
  isDefaultExpanded: boolean;
  onToggle: () => void;
  onOpacityChange: (value: number) => void;
}
const faqUrl = '#';
export function DaiWidget({ isEnabled, opacity, className, isLoading, isDefaultExpanded, onToggle, onOpacityChange }: Props) {
  const { t } = useTranslation('availability');
  const { isDesktopLayout } = useDevice();
  const [isExpanded, setIsExpanded] = useState(isDefaultExpanded);

  const handleExpand = useCallback(() => setIsExpanded(v => !v), []);

  return (
    <div className={classnames(styles.DaiWidget, className)}>
      <div className={styles.Header}>
        <div className={styles.Title}>
          <LayersIcon className={styles.LayersIcon} />
          <span>{t('dai_widget.title')}</span>
        </div>
        <div className={styles.Controls}>
          {isLoading && <ReloadIcon data-testid="sh-reload-icon" className={styles.ReloadIcon} />}
          {!isLoading && <ToggleButton checked={isEnabled} onChange={onToggle} size="tiny" />}
          {isDesktopLayout && (
            <button
              className={classnames(styles.ChevronButton, { [styles.Collapsed]: !isExpanded })}
              onClick={handleExpand}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              <ChevronIcon />
            </button>
          )}
        </div>
      </div>

      {((isDesktopLayout && isExpanded) || (!isDesktopLayout && isEnabled)) && (
        <div className={styles.Body}>
          <div className={styles.OpacitySection}>
            <div className={styles.OpacityTitleRow}>
              <span className={styles.Label}>{t('dai_widget.opacity')}</span>
              <span className={styles.OpacityValue}>{opacity}%</span>
            </div>
            <RangeSlider min={0} max={100} initialValue={opacity} size="small" onChange={onOpacityChange} />
          </div>

          <div className={styles.LegendItems}>
            {LEGEND_ITEMS.map(({ label, color }) => (
              <div key={label} className={styles.LegendItem}>
                <span className={styles.Swatch} style={{ backgroundColor: color }} />
                <span className={styles.LegendLabel}>{t(`dai_widget.${label}`)}</span>
              </div>
            ))}
          </div>

          {faqUrl && (
            <a href={faqUrl} target="_blank" rel="noopener noreferrer" className={styles.FaqLink}>
              {t('dai_widget.read_faq')}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
