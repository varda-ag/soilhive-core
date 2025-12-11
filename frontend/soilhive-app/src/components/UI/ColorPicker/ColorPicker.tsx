import { useCallback, useState, useEffect, type ChangeEvent } from 'react';
import classnames from 'classnames';

import styles from './ColorPicker.module.scss';

interface Props {
  initialValue?: string;
  name: string;
  className?: string;
  onChange: (value: string, name: string) => void;
}

export function ColorPicker({ initialValue = '', name, className, onChange }: Props) {
  const [currentValue, setCurrentValue] = useState<string>('');

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setCurrentValue(event.target.value);
      onChange(event.target.value, name);
    },
    [onChange, name],
  );

  useEffect(() => {
    if (currentValue !== initialValue) {
      setCurrentValue(initialValue);
    }
  }, [initialValue, currentValue]);

  return (
    <label
      data-testid="sh-colorpicker"
      className={classnames(styles.ColorPicker, className)}
      style={{
        backgroundColor: currentValue || 'transparent',
      }}
    >
      <input
        data-testid="sh-colorpicker-input"
        type="color"
        name={name}
        value={currentValue}
        className={styles.InputField}
        onChange={handleChange}
      />
    </label>
  );
}
