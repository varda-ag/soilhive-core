import { useMemo } from 'react';
import useAvailability from './useAvailability';
import type { NestedCheckboxItemType, Selection } from 'types/components';
import { collectAllIds, getBranchIds } from 'components/UI/NestedCheckbox/nestedCheckboxHelpers';

type SoilPropertiesFiltersType = {
  isLoading: boolean;
  isNoData: boolean;
  isNoFilteredData: boolean;
  nestedSoilProperties: NestedCheckboxItemType[];
  selectedSoilProperties: string[];
  pillSelections: Selection[];
  hasUnavailablePropertySelected: boolean;
  handlePillRemove: (id: string) => void;
  handleOnChange: (selected: string[]) => void;
};

const useSoilPropertiesFilters = (): SoilPropertiesFiltersType => {
  const {
    isLoading,
    isNoData,
    isNoFilteredData,
    allSoilProperties,
    filteredSoilProperties,
    selectedSoilProperties,
    setSelectedSoilProperties,
    setDatasetFilters,
  } = useAvailability();

  const nestedSoilProperties = useMemo((): NestedCheckboxItemType[] => {
    const nodeMap: { [id: string]: NestedCheckboxItemType } = {};
    const roots: NestedCheckboxItemType[] = [];

    // Initialize all nodes with empty children array
    allSoilProperties.forEach(property => {
      nodeMap[property.id] = {
        id: property.id,
        label: property.property_name,
        children: [],
        isRoot: property.parent_property_id === null,
      };
    });

    // Link children to parents and collect roots
    filteredSoilProperties.forEach(property => {
      const node = nodeMap[property.id];
      if (property.parent_property_id) {
        const parent = nodeMap[property.parent_property_id];
        if (parent) {
          parent.children!.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    // Add roots that are not in filteredSoilProperties
    Object.values(nodeMap).forEach(node => {
      if (!roots.includes(node) && node.children!.length && node.isRoot) {
        roots.push(node);
      }
    });

    return roots;
  }, [allSoilProperties, filteredSoilProperties]);

  const availableSoilPropertiesIds = useMemo(() => {
    const ids = [];

    for (const property of nestedSoilProperties) {
      ids.push(...collectAllIds(property));
    }
    return ids;
  }, [nestedSoilProperties]);

  const pillSelections = useMemo((): Selection[] => {
    return allSoilProperties
      .filter(property => selectedSoilProperties.includes(property.id))
      .map(property => ({
        id: property.id,
        label: property.property_name,
        disabled: !isLoading && !availableSoilPropertiesIds.includes(property.id),
      }));
  }, [isLoading, selectedSoilProperties, allSoilProperties, availableSoilPropertiesIds]);

  const handlePillRemove = (id: string) => {
    // identify all leaf IDs that belong to the pill being removed
    const leafIdsToRemove = getBranchIds(nestedSoilProperties, id);
    handleOnChange(selectedSoilProperties.filter(selectedId => !leafIdsToRemove.includes(selectedId)));
  };

  const handleOnChange = (selected: string[]) => {
    setSelectedSoilProperties(selected);
    setDatasetFilters(prevFilters => {
      return selected.length === 0 ? { ...prevFilters, soil_properties: undefined } : { ...prevFilters, soil_properties: selected };
    });
  };

  const hasUnavailablePropertySelected = useMemo(() => {
    return pillSelections.some(pill => pill.disabled);
  }, [pillSelections]);

  return {
    isLoading,
    isNoData,
    isNoFilteredData,
    nestedSoilProperties,
    selectedSoilProperties,
    pillSelections,
    hasUnavailablePropertySelected,
    handleOnChange,
    handlePillRemove,
  };
};

export default useSoilPropertiesFilters;
