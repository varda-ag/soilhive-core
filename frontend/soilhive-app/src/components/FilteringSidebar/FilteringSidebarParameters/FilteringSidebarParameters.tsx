import { Accordion, NestedCheckbox, SelectionPills} from 'components/UI';
import { AvailabilityContext } from '../../../contexts/AvailabilityContext';
import type { NestedCheckboxItemType } from 'types/components';
import { getTopLevelSelections } from 'components/UI/NestedCheckbox/nestedCheckboxHelpers';
import type { Selection } from 'types/components';

import styles from './FilteringSidebarParameters.module.scss';
import { useContext, useState } from 'react';

export const mockProperties: NestedCheckboxItemType[] = [
  {
    id: '1',
    label: 'First',
    children: [
      {
        id: '1-1',
        label: 'First-First',
        children: [
          { id: '1-1-1', label: 'First first first' },
          { id: '1-1-2', label: 'First first second' },
        ],
      },
      {
        id: '1-2',
        label: 'First-Second',
      },
    ],
  },
  {
    id: '2',
    label: 'Second',
    children: [
      { id: '2-1', label: 'Second-First' },
      { id: '2-2', label: 'Second-Second' },
    ],
  },
];

export function FilteringSidebarParameters() {
  const availabilityContext = useContext(AvailabilityContext);

  if (!availabilityContext) {
    throw new Error('AvailabilityContext must be used within AvailabilityProvider');
  }

  const { setDatasetFilters } = availabilityContext;

  const [selectedProperties, setSelectedProperties] = useState<string[]>([]);

  const handlePillRemove = (id: string) => {
    setSelectedProperties(prev => prev.filter(selectedId => selectedId !== id));
  };

  const leafSelections = getTopLevelSelections(mockProperties, selectedProperties);

  const pillSelections: Selection[] = leafSelections.map(item => ({
    id: item.id,
    label: item.label,
  }));

  return (
    <div className={styles.FilteringSidebarParameters}>
      <Accordion
        title="Soil Properties"
        type="secondary"
        pillsSlot={<SelectionPills selections={pillSelections} onRemove={handlePillRemove} />}
      >
        <div className={styles.SoilProperties}>
          <NestedCheckbox items={mockProperties} selected={selectedProperties} onChange={onChange} />
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

  function onChange(selected: string[]) {
    setSelectedProperties(selected);
    setDatasetFilters(prevFilters => {
      return selected.length === 0 ? { ...prevFilters, soil_properties: undefined } : { ...prevFilters, soil_properties: selected };
    });
  }
}
