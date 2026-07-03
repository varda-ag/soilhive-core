import { useCallback, useMemo, type ChangeEvent, type ReactNode } from 'react';
import classnames from 'classnames';

import type { ComponentSizeType } from 'types/components';

import styles from './RadioButton.module.scss';

interface Props {
  name: string;
  value: string;
  className?: string;
  label?: ReactNode;
  size?: ComponentSizeType;
  isChecked?: boolean;
  isError?: boolean;
  isDisabled?: boolean;
  onChange: (value: string, name: string) => void;
}
export function RadioButton({
  className,
  name,
  label,
  size = 'medium',
  value,
  isChecked = false,
  isError = false,
  isDisabled = false,
  onChange,
}: Props) {
  const sizeClass = useMemo(
    () =>
      ({
        medium: styles.Medium,
        small: styles.Small,
        tiny: styles.Tiny,
      })[size],
    [size],
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const { value } = e.target;
      onChange?.(value, name);
    },
    [onChange, name],
  );

  return (
    <label
      data-testid="sh-ui-radiobutton"
      className={classnames(
        styles.RadioButton,
        sizeClass,
        { [styles.Checked]: isChecked },
        { [styles.Error]: isError },
        { [styles.Disabled]: isDisabled },
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={isChecked}
        onChange={handleChange}
        disabled={isDisabled}
        className={styles.Input}
      />
      {label && <div className={styles.Label}>{label}</div>}
    </label>
  );
}
