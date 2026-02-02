import { useContext, useMemo, useState, useCallback, type ChangeEvent, useRef } from 'react';
import { Accordion, NestedCheckbox, SelectionPills, Toggle } from 'components/UI';
import { AvailabilityContext } from '../../../contexts/AvailabilityContext';
import type { NestedCheckboxItemType, NestedCheckboxRef, Selection } from 'types/components';
import { getBranchIds, getTopLevelSelections, collectParentsIds } from 'components/UI/NestedCheckbox/nestedCheckboxHelpers';
import { filterNestedItems } from 'components/UI/NestedCheckbox/nestedCheckboxHelpers';

import styles from './FilteringSidebarParameters.module.scss';

export function FilteringSidebarParameters() {
  const availabilityContext = useContext(AvailabilityContext);
  if (!availabilityContext) {
    throw new Error('AvailabilityContext must be used within AvailabilityProvider');
  }

  const {
    setDatasetFilters,
    allSoilProperties,
    filteredSoilProperties,
    isLoadingSoilProperties,
    selectedSoilProperties,
    setSelectedSoilProperties,
  } = availabilityContext;

  const [soilPropertiesExpanded, setSoilPropertiesExpanded] = useState(false);
  const soilPropertiesRef = useRef<NestedCheckboxRef>(null);

  const nestedSoilProperties = useMemo((): NestedCheckboxItemType[] => {
    const nodeMap: { [id: string]: NestedCheckboxItemType } = {};
    const roots: NestedCheckboxItemType[] = [];

    // Initialize all nodes with empty children array
    allSoilProperties.forEach(property => {
      nodeMap[property.id] = {
        id: property.slug,
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

  const parentProperties = useMemo((): string[] => {
    return collectParentsIds(nestedSoilProperties);
  }, [nestedSoilProperties]);

  const handlePillRemove = (id: string) => {
    // identify all leaf IDs that belong to the pill being removed
    const leafIdsToRemove = getBranchIds(nestedSoilProperties, id);
    onChange(selectedSoilProperties.filter(selectedId => !leafIdsToRemove.includes(selectedId)));
  };

  const onChange = (selected: string[]) => {
    setSelectedSoilProperties(selected);
    setDatasetFilters(prevFilters => {
      return selected.length === 0 ? { ...prevFilters, soil_properties: undefined } : { ...prevFilters, soil_properties: selected };
    });
  };

  const leafSelections = getTopLevelSelections(nestedSoilProperties, selectedSoilProperties);

  const pillSelections: Selection[] = leafSelections.map(item => ({
    id: item.id,
    label: item.label,
  }));

  const [searchTerm, setSearchTerm] = useState<string>('');

  const handleSearch = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setSoilPropertiesExpanded(true);
    soilPropertiesRef.current?.expandAll();
  }, []);

  const handleProperitesExpansionToggle = useCallback(() => {
    if (soilPropertiesExpanded) {
      soilPropertiesRef.current?.collapseAll();
    } else {
      soilPropertiesRef.current?.expandAll();
    }
    setSoilPropertiesExpanded(!soilPropertiesExpanded);
  }, [soilPropertiesExpanded]);

  const handleToggleVisibility = useCallback(
    (expandedIds: string[]) => {
      const allExpanded = parentProperties.every(item => expandedIds.includes(item));
      if (allExpanded && !soilPropertiesExpanded) {
        setSoilPropertiesExpanded(true);
      }

      if (!allExpanded && soilPropertiesExpanded) {
        setSoilPropertiesExpanded(false);
      }
    },
    [parentProperties, soilPropertiesExpanded],
  );

  const filteredProperties = useMemo(() => filterNestedItems(nestedSoilProperties, searchTerm), [nestedSoilProperties, searchTerm]);

  return (
    <div className={styles.FilteringSidebarParameters}>
      {isLoadingSoilProperties && <p>Loading soil properties...</p>}
      <Accordion
        title="Soil Properties"
        type="secondary"
        pillsSlot={pillSelections.length > 0 ? <SelectionPills selections={pillSelections} onRemove={handlePillRemove} /> : null}
      >
        <div className={styles.SoilProperties}>
          <input
            type="text"
            placeholder="Search soil properties"
            value={searchTerm}
            onChange={handleSearch}
            className={styles.SearchInput}
          />
          <Toggle
            labelOne="Expand All"
            labelTwo="Collapse All"
            isToggled={soilPropertiesExpanded}
            onToggle={handleProperitesExpansionToggle}
          />
          <NestedCheckbox
            ref={soilPropertiesRef}
            className={styles.SoilPropertiesCheckbox}
            items={filteredProperties}
            selected={selectedSoilProperties}
            onChange={onChange}
            onToggleVisibility={handleToggleVisibility}
          />
        </div>
      </Accordion>
    </div>
  );
}
