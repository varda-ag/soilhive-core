import { useCallback, useEffect, useState } from 'react';
import { Button, MultirangeSlider } from 'components/UI';

import styles from './TimeFilter.module.scss';
import type { TimeFilterState } from 'types/availability';

const MIN_TIME = 1964;
const MAX_TIME = 2022;

interface Props {
  initialState: TimeFilterState;
  initialMax?: number;
  onChange: (state: TimeFilterState) => void;
}

export function TimeFilter({ initialState, onChange }: Props) {
  const [selectedTime, setSelectedTime] = useState<Required<TimeFilterState>>({
    min: initialState.min || MIN_TIME,
    max: initialState.max || MAX_TIME,
  });
  const [isApplyDisabled, setIsApplyDisabled] = useState<boolean>(true);

  const onTimeChange = useCallback((min: number, max: number) => {
    setSelectedTime({ min, max });
    setIsApplyDisabled(false);
    console.log(min, max);
  }, []);

  const setInitialState = useCallback(() => {
    setSelectedTime({
      min: initialState.min || MIN_TIME,
      max: initialState.max || MAX_TIME,
    });
    setIsApplyDisabled(true);
  }, [initialState]);

  const handleApply = useCallback(() => {
    onChange(selectedTime);
    setIsApplyDisabled(true);
  }, [selectedTime, onChange]);

  useEffect(() => {
    setInitialState();
  }, [setInitialState]);

  return (
    <div className={styles.TimeFilter}>
      <MultirangeSlider
        min={MIN_TIME}
        max={MAX_TIME}
        selectedMin={selectedTime.min}
        selectedMax={selectedTime.max}
        onChange={onTimeChange}
      />
      <div className={styles.TimeFilterActions}>
        <Button size="tiny" type="tertiary" onClick={setInitialState}>
          Cancel
        </Button>
        <Button size="tiny" onClick={handleApply} isDisabled={isApplyDisabled}>
          Apply
        </Button>
      </div>
    </div>
  );
}
