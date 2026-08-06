import { useMemo } from 'react';
import { useSoilProperties } from './useSoilProperties';
import type { MenuOption } from 'components/UI/types';

// Unit options and sorted soil properties — depends only on API data, not user selections.
export function useSoilPropertyOptions() {
  const { data: soilProperties, isLoading: isLoadingSoilProperties } = useSoilProperties();

  const { soilPropertyOptions, unitOptionsByConcept } = useMemo(() => {
    const properties = soilProperties ?? [];
    const parentIds = new Set(properties.map(p => p.parent_property_id).filter(Boolean));
    const filteredProperties = properties.filter(p => !parentIds.has(p.id));
    const soilPropertyOptions = filteredProperties
      .map(p => ({ code: p.id, name: p.property_name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const unitOptionsByConcept: Record<string, MenuOption[]> = {};
    for (const p of properties) {
      unitOptionsByConcept[p.id] = Object.entries(p.original_units_of_measurement ?? {}).map(([code, name]) => ({ code, name }));
    }
    return { soilPropertyOptions, unitOptionsByConcept };
  }, [soilProperties]);

  return { soilPropertyOptions, unitOptionsByConcept, isLoadingSoilProperties };
}
