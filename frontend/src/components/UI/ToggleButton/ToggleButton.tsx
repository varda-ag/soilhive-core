import { useMemo } from 'react';
import classnames from 'classnames';

import type { ComponentSizeType } from 'types/components';

import styles from './ToggleButton.module.scss';

interface Props {
  checked?: boolean;
  size?: ComponentSizeType;
  disabled?: boolean;
  onChange?: () => void;
}

export function ToggleButton({ checked, onChange, size = 'medium', disabled }: Props) {
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
      <input className={styles.ToggleCheckbox} type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
      <span className={styles.ToggleSlider}></span>
    </label>
  );
}
