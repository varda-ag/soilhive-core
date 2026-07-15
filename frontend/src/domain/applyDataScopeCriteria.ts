import type { FilterCriteria, GISDataType } from 'types/backend';
import { DATA_ACCESS_ITEMS, DATA_TYPE_ITEMS } from '../configuration/filters';

/**
 * Maps a data-scope selection (the "Data type" / "Data access" multiselects) onto the
 * backend FilterCriteria. Selecting none or all of a filter's static options means
 * "unconstrained": the criterion key is removed entirely — never set to [] (which
 * matches nothing server-side) or to undefined (which still counts in the
 * Object.keys gates on the filter payload).
 */
export const applyDataScopeCriteria = (prevFilters: FilterCriteria, name: string, value: string[]): FilterCriteria => {
  if (name === 'type') {
    const next = { ...prevFilters };
    delete next.data_types;
    if (value.length > 0 && value.length < DATA_TYPE_ITEMS.length) {
      next.data_types = value as GISDataType[];
    }
    return next;
  }
  if (name === 'visibility') {
    const next = { ...prevFilters };
    delete next.visibility;
    // The backend visibility criterion is a scalar: it exists only when exactly
    // one of the DATA_ACCESS_ITEMS options is selected
    if (value.length === 1 && value.length < DATA_ACCESS_ITEMS.length) {
      next.visibility = value[0] as 'public' | 'private';
    }
    return next;
  }
  return prevFilters;
};
