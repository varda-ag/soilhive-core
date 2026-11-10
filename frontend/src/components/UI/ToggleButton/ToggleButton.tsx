import { useMemo } from 'react';
import classnames from 'classnames';

import type { ComponentSizeType } from '../types';

import styles from './ToggleButton.module.scss';

interface Props {
  checked?: boolean;
  size?: ComponentSizeType;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
  /**
   * Rendered as data-analytics on the checkbox, not the label around it, so a click on the label counts
   * once: Google Analytics gets the event of this name, with click_value on or off (docs/frontend/analytics.md)
   */
  dataAnalytics?: string;
}

export function ToggleButton({ checked, onChange, size = 'medium', disabled, dataAnalytics }: Props) {
  const sizeClass = useMemo(
    () =>
      ({
        medium: styles.Medium,
        small: styles.Small,
        tiny: styles.Tiny,
      })[size],
    [size],
  );

  return (
    <label className={classnames(styles.ToggleButton, sizeClass, { [styles.Disabled]: disabled })}>
      <input
        className={styles.ToggleCheckbox}
        type="checkbox"
        data-analytics={dataAnalytics}
        checked={checked}
        onChange={e => onChange?.(e.target.checked)}
        disabled={disabled}
      />
      <span className={styles.ToggleSlider}></span>
    </label>
  );
}
