import { Accordion, NestedCheckbox } from 'components/UI';
import type { NestedCheckboxItemType } from 'types/components';

import styles from './FilteringSidebarParameters.module.scss';
import { useState } from 'react';

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
  const [selectedProperties, setSelectedProperties] = useState<string[]>([]);

  return (
    <div className={styles.FilteringSidebarParameters}>
      <Accordion title="Soil Properties" type="secondary">
        <div className={styles.SoilProperties}>
          <NestedCheckbox items={mockProperties} selected={selectedProperties} onChange={setSelectedProperties} />
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
