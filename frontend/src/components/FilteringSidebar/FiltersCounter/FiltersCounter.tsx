import useAvailability from 'hooks/useAvailability';

import styles from './FiltersCounter.module.scss';

export function FiltersCounter() {
  const { appliedFiltersCount } = useAvailability();

  return (
    <span data-testid="sh-filters-counter" className={styles.FiltersCounter}>
      {appliedFiltersCount}
    </span>
  );
}
