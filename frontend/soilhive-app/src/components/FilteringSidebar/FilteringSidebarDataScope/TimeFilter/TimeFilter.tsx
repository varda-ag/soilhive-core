import { useCallback, useEffect, useState } from 'react';
import { Button, MultirangeSlider } from 'components/UI';
import type { TimeFilterState } from 'types/availability';
import useAvailability from 'hooks/useAvailability';

import styles from './TimeFilter.module.scss';

interface Props {
  initialState: TimeFilterState;
  onChange: (state: TimeFilterState) => void;
}

export function TimeFilter({ initialState, onChange }: Props) {
  const { timeFilterRange } = useAvailability();
  const [selectedTime, setSelectedTime] = useState<Required<TimeFilterState>>({
    min: initialState.min || timeFilterRange.min,
    max: initialState.max || timeFilterRange.max,
  });

  const onTimeChange = useCallback((min: number, max: number) => {
    setSelectedTime({ min, max });
  }, []);

  const setInitialState = useCallback(() => {
    setSelectedTime({
      min: !initialState.min || initialState.min < timeFilterRange.min ? timeFilterRange.min : initialState.min,
      max: !initialState.max || initialState.max > timeFilterRange.max ? timeFilterRange.max : initialState.max,
    });
  }, [initialState, timeFilterRange]);

  const handleApply = useCallback(() => {
    onChange(selectedTime);
  }, [selectedTime, onChange]);

  useEffect(() => {
    setInitialState();
  }, [setInitialState]);

  if (!timeFilterRange.min || !timeFilterRange.max) {
    return null;
  }

  return (
    <div className={styles.TimeFilter}>
      <MultirangeSlider
        min={timeFilterRange.min}
        max={timeFilterRange.max}
        selectedMin={selectedTime.min}
        selectedMax={selectedTime.max}
        disabled={timeFilterRange.min === timeFilterRange.max}
        onChange={onTimeChange}
      />
      <div className={styles.TimeFilterActions}>
        <Button size="tiny" type="tertiary" onClick={setInitialState}>
          Cancel
        </Button>
        <Button size="tiny" onClick={handleApply}>
          Apply
        </Button>
      </div>
    </div>
  );
}
