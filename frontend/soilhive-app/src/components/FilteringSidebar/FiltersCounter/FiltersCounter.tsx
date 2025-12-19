import styles from './FiltersCounter.module.scss';

export function FiltersCounter() {
  return (
    <span data-testid="sh-filters-counter" className={styles.FiltersCounter}>
      0
    </span>
  );
}
