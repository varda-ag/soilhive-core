import { FilterCriteria } from '../../interfaces/DatasetFilter';

/** The only Filter criteria a Soil Index honours; every other one is ignored (docs/adr/0058). */
export type SamplingRange = Pick<FilterCriteria, 'min_sampling_date' | 'max_sampling_date'>;

/** The Filter's bounds as given: an absent one stays absent, and an explicit null is kept, since it filters. */
export const samplingRangeOf = (parameters: FilterCriteria): SamplingRange => ({
  ...(parameters.min_sampling_date !== undefined ? { min_sampling_date: parameters.min_sampling_date } : {}),
  ...(parameters.max_sampling_date !== undefined ? { max_sampling_date: parameters.max_sampling_date } : {}),
});

/** Filter dates are `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. */
const yearOf = (date: string): number => Number(date.slice(0, 4));

const BOUNDS = [
  { key: 'min_sampling_date', operator: '>=', admits: (year: number, bound: number) => year >= bound },
  { key: 'max_sampling_date', operator: '<=', admits: (year: number, bound: number) => year <= bound },
] as const;

/**
 * A score's year is a Partial date standing for the whole year, so it is in range when that year
 * overlaps it: comparing years is exact. A null bound keeps only scores with no year, and a dated
 * bound drops them, as for a Layer's sampling date.
 */
export const yearInSamplingRange = (year: number | null | undefined, range: SamplingRange): boolean =>
  BOUNDS.every(({ key, admits }) => {
    const bound = range[key];
    if (bound === undefined) {
      return true;
    }
    if (bound === null) {
      return year == null;
    }
    return year != null && admits(year, yearOf(bound));
  });

/** yearInSamplingRange over the SQL `column`; `p` binds a value and returns its placeholder. */
export const yearInSamplingRangeSql = (column: string, range: SamplingRange, p: (value: unknown) => string): string => {
  const clauses = BOUNDS.flatMap(({ key, operator }) => {
    const bound = range[key];
    if (bound === undefined) {
      return [];
    }
    return bound === null ? [`${column} IS NULL`] : [`${column} ${operator} ${p(yearOf(bound))}::int`];
  });
  return clauses.length > 0 ? clauses.join(' AND ') : 'TRUE';
};
