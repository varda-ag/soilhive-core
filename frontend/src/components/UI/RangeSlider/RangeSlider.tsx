import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import classnames from 'classnames';

import type { ComponentSizeType } from 'types/components';

import styles from './RangeSlider.module.scss';

interface Props {
  min: number;
  max: number;
  initialValue: number;
  size?: ComponentSizeType;
  step?: number;
  showButtons?: boolean;
  disabled?: boolean;
  onChange: (value: number) => void;
}

export function RangeSlider({ min, max, initialValue, size = 'medium', disabled, showButtons, step = 1, onChange }: Props) {
  const [selectedValue, setSelectedValue] = useState(initialValue);

  const sizeClass = useMemo(
    () =>
      ({
        medium: styles.Medium,
        small: styles.Small,
        tiny: styles.Tiny,
      })[size],
    [size],
  );

  const getPercent = useCallback((value: number) => Math.round(((value - min) / (max - min)) * 100), [min, max]);

  const rangeWidthStyle = useMemo((): string => {
    const maxPercent = getPercent(selectedValue);
    return `${maxPercent}%`;
  }, [getPercent, selectedValue]);

  const changeValue = useCallback(
    (value: number) => {
      setSelectedValue(value);
      onChange(value);
    },
    [onChange],
  );

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = Math.max(Number(event.target.value));
      changeValue(value);
    },
    [changeValue],
  );

  const handleDecrease = useCallback(() => {
    const value = selectedValue - step;
    changeValue(value < min ? min : value);
  }, [changeValue, min, step, selectedValue]);

  const handleIncrease = useCallback(() => {
    const value = selectedValue + step;
    changeValue(value > max ? max : value);
  }, [changeValue, max, step, selectedValue]);

  useEffect(() => {
    setSelectedValue(initialValue);
  }, [initialValue]);

  return (
    <div
      data-testid="sh-ui-range"
      className={classnames(styles.Range, sizeClass, {
        [styles.Disabled]: disabled,
      })}
    >
      {showButtons && (
        <button className={classnames(styles.RangeButton, styles.Decrease)} onClick={handleDecrease} disabled={selectedValue === min}>
          -
        </button>
      )}
      <div
        className={classnames(styles.RangeSliderWrapper, {
          [styles.Disabled]: disabled,
        })}
      >
        <input
          type="range"
          min={min}
          max={max}
          value={selectedValue}
          onChange={handleChange}
          disabled={disabled}
          step={step}
          className={classnames(styles.RangeThumb)}
        />
        <div className={styles.RangeSlider}>
          <div className={styles.RangeSliderTrack} />
          <div data-testid="sh-ui-range-filled" style={{ width: rangeWidthStyle }} className={styles.RangeSliderRange} />
        </div>
      </div>
      {showButtons && (
        <button className={classnames(styles.RangeButton, styles.Increase)} onClick={handleIncrease} disabled={selectedValue === max}>
          +
        </button>
      )}
    </div>
  );
}
