import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, MultirangeSlider } from 'components/UI';
import type { TimeFilterState } from 'types/availability';
import useDataScopeFilters from 'hooks/useDataScopeFilters';

import styles from './TimeFilter.module.scss';

export function TimeFilter() {
  const { t } = useTranslation('availability');
  const { timeFilterRange, selectedTimeFilter, handleTimeFilterChange } = useDataScopeFilters();

  const [selectedTime, setSelectedTime] = useState<Required<TimeFilterState>>({
    min: selectedTimeFilter.min || timeFilterRange.min,
    max: selectedTimeFilter.max || timeFilterRange.max,
  });

  const onTimeChange = useCallback((min: number, max: number) => {
    setSelectedTime({ min, max });
  }, []);

  const setInitialState = useCallback(() => {
    setSelectedTime({
      min: !selectedTimeFilter.min || selectedTimeFilter.min < timeFilterRange.min ? timeFilterRange.min : selectedTimeFilter.min,
      max: !selectedTimeFilter.max || selectedTimeFilter.max > timeFilterRange.max ? timeFilterRange.max : selectedTimeFilter.max,
    });
  }, [selectedTimeFilter, timeFilterRange]);

  const handleApply = useCallback(() => {
    handleTimeFilterChange(selectedTime);
  }, [selectedTime, handleTimeFilterChange]);

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
        minAriaLabel={t('time_filter.min_year_aria')}
        maxAriaLabel={t('time_filter.max_year_aria')}
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
