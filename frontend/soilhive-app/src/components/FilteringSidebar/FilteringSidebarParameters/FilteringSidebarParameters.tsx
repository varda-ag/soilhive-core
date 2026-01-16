import { Accordion, NestedCheckbox, SelectionPills } from 'components/UI';
import { AvailabilityContext } from '../../../contexts/AvailabilityContext';
import type { NestedCheckboxItemType } from 'types/components';
import { getBranchIds, getTopLevelSelections } from 'components/UI/NestedCheckbox/nestedCheckboxHelpers';
import type { Selection } from 'types/components';

import styles from './FilteringSidebarParameters.module.scss';
import { useContext, useMemo, useState } from 'react';

export function FilteringSidebarParameters() {
  const availabilityContext = useContext(AvailabilityContext);
  if (!availabilityContext) {
    throw new Error('AvailabilityContext must be used within AvailabilityProvider');
  }

  const { setDatasetFilters, allSoilProperties, filteredSoilProperties, isLoadingSoilProperties } = availabilityContext;

  const [selectedProperties, setSelectedProperties] = useState<string[]>([]);

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

  const handlePillRemove = (id: string) => {
    // identify all leaf IDs that belong to the pill being removed
    const leafIdsToRemove = getBranchIds(nestedSoilProperties, id);
    onChange(selectedProperties.filter(selectedId => !leafIdsToRemove.includes(selectedId)));
  };

  const onChange = (selected: string[]) => {
    setSelectedProperties(selected);
    setDatasetFilters(prevFilters => {
      return selected.length === 0 ? { ...prevFilters, soil_properties: undefined } : { ...prevFilters, soil_properties: selected };
    });
  };

  const leafSelections = getTopLevelSelections(nestedSoilProperties, selectedProperties);

  const pillSelections: Selection[] = leafSelections.map(item => ({
    id: item.id,
    label: item.label,
  }));

  return (
    <div className={styles.FilteringSidebarParameters}>
      {isLoadingSoilProperties && <p>Loading soil properties...</p>}
      <Accordion
        title="Soil Properties"
        type="secondary"
        pillsSlot={<SelectionPills selections={pillSelections} onRemove={handlePillRemove} />}
      >
        <div className={styles.SoilProperties}>
          <NestedCheckbox items={nestedSoilProperties} selected={selectedProperties} onChange={onChange} />
        </div>
      </Accordion>
      <Accordion title="Soil Groups" type="secondary">
        Soil Groups content
      </Accordion>
      <Accordion title="Soil Depth" type="secondary">
        Soil Depth content
      </Accordion>
      <Accordion title="Horizon" type="secondary">
        Horizon content
      </Accordion>
    </div>
  );
}
