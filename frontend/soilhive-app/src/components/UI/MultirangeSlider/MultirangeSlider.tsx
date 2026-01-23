import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import classnames from 'classnames';

import styles from './MultirangeSlider.module.scss';

interface Props {
  min: number;
  max: number;
  selectedMin: number;
  selectedMax: number;
  onChange: (min: number, max: number) => void;
}

export function MultirangeSlider({ min, max, selectedMin, selectedMax, onChange }: Props) {
  const [minVal, setMinVal] = useState(selectedMin);
  const [maxVal, setMaxVal] = useState(selectedMax);
  const minInputRef = useRef<HTMLInputElement | null>(null);
  const maxInputRef = useRef<HTMLInputElement | null>(null);

  const getPercent = useCallback((value: number) => Math.round(((value - min) / (max - min)) * 100), [min, max]);

  const rangeLeftStyle = useMemo((): string => {
    const minPercent = getPercent(minVal);

    return `${minPercent}%`;
  }, [getPercent, minVal]);

  const rangeWidthStyle = useMemo((): string => {
    const minPercent = getPercent(minVal);
    const maxPercent = getPercent(maxVal);

    return `${maxPercent - minPercent}%`;
  }, [getPercent, maxVal, minVal]);

  const changeMinValue = useCallback(
    (value: number) => {
      setMinVal(value);
      onChange(value, maxVal);
    },
    [onChange, maxVal],
  );

  const changeMaxValue = useCallback(
    (value: number) => {
      setMaxVal(value);
      onChange(minVal, value);
    },
    [onChange, minVal],
  );

  const handleMinChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = Math.min(Number(event.target.value), maxVal);
      (minInputRef.current as HTMLInputElement).value = value.toString();

      changeMinValue(value);
    },
    [maxVal, changeMinValue],
  );

  const handleMaxChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = Math.max(Number(event.target.value), minVal);
      (maxInputRef.current as HTMLInputElement).value = value.toString();

      changeMaxValue(value);
    },
    [minVal, changeMaxValue],
  );

  const handleMinInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value);

      if (value >= min && value <= maxVal) {
        changeMinValue(value);
      }
    },
    [changeMinValue, maxVal, min],
  );

  const handleMaxInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value);
      if (value >= minVal && value <= max) {
        changeMaxValue(value);
      }
    },
    [changeMaxValue, max, minVal],
  );

  const handleMinInputFocusOut = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      event.target.value = minVal.toString();
    },
    [minVal],
  );

  const handleMaxInputFocusOut = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      event.target.value = maxVal.toString();
    },
    [maxVal],
  );

  useEffect(() => {
    setMinVal(selectedMin);
    setMaxVal(selectedMax);

    (minInputRef.current as HTMLInputElement).value = selectedMin.toString();
    (maxInputRef.current as HTMLInputElement).value = selectedMax.toString();
  }, [selectedMin, selectedMax]);

  return (
    <div data-testid="sh-ui-multirange" className={styles.Multirange}>
      <input
        type="range"
        min={min}
        max={max}
        value={minVal}
        onChange={handleMinChange}
        className={classnames(styles.MultirangeThumb, styles.MultirangeThumbLeft)}
        style={{ zIndex: minVal === max ? '5' : '' }}
      />
      <input
        type="range"
        min={min}
        max={max}
        value={maxVal}
        onChange={handleMaxChange}
        className={classnames(styles.MultirangeThumb, styles.MultirangeThumbRight)}
      />

      <div className={styles.MultirangeSlider}>
        <div className={styles.MultirangeSliderTrack} />
        <div style={{ left: rangeLeftStyle, width: rangeWidthStyle }} className={styles.MultirangeSliderRange} />
      </div>
      <div className={styles.MultirangeSliderBox}>
        <input
          ref={minInputRef}
          type="number"
          min={min}
          max={maxVal}
          onChange={handleMinInputChange}
          onBlur={handleMinInputFocusOut}
          defaultValue={minVal}
          className={styles.MultirangeSliderInput}
        />
        <input
          ref={maxInputRef}
          type="number"
          min={min}
          max={max}
          onChange={handleMaxInputChange}
          onBlur={handleMaxInputFocusOut}
          defaultValue={maxVal}
          className={styles.MultirangeSliderInput}
        />
      </div>
    </div>
  );
}
