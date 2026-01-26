import { useCallback, useMemo, useState } from 'react';
import { TimeFilter } from './TimeFilter/TimeFilter';
import { Accordion, MultiselectButtons, SelectionPills } from 'components/UI';
import type { Selection } from 'types/components';
import type { TimeFilterState } from 'types/availability';

import styles from './FilteringSidebarDataScope.module.scss';

const DATA_TYPE_ITEMS: Selection[] = [
  {
    id: 'point',
    label: 'Point',
  },
  {
    id: 'raster',
    label: 'Raster',
  },
  {
    id: 'polygonal',
    label: 'Polygonal',
  },
];

const DATA_ACCESS_ITEMS: Selection[] = [
  {
    id: 'private',
    label: 'Private',
  },
  {
    id: 'public',
    label: 'Public',
  },
];

export function FilteringSidebarDataScope() {
  const [selectedDataType, setSelectedDataType] = useState<string[]>([]);
  const [selectedDataAccess, setSelectedDataAccess] = useState<string[]>([]);
  const [selectedTime, setSelectedTime] = useState<TimeFilterState>({});

  const onDataTypeChange = useCallback((selected: string[]) => {
    setSelectedDataType(selected);
  }, []);

  const dataTypePills = useMemo((): Selection[] => {
    return DATA_TYPE_ITEMS.filter(item => selectedDataType.includes(item.id));
  }, [selectedDataType]);

  const dataTypePillRemove = useCallback(
    (id: string) => {
      setSelectedDataType(selectedDataType.filter(selectedId => selectedId !== id));
    },
    [selectedDataType],
  );

  const onTimeFilterChange = useCallback((value: TimeFilterState) => {
    setSelectedTime(value);
  }, []);

  const timeFilterPill = useMemo(() => {
    if (selectedTime.max && selectedTime.min) {
      return [
        {
          id: 'time',
          label: `${selectedTime.min}-${selectedTime.max}`,
        },
      ];
    }

    return null;
  }, [selectedTime]);

  const TimePillRemove = useCallback(() => {
    setSelectedTime({});
  }, []);

  const onDataAccessChange = useCallback((selected: string[]) => {
    setSelectedDataAccess(selected);
  }, []);

  const dataAccessPills = useMemo((): Selection[] => {
    return DATA_ACCESS_ITEMS.filter(item => selectedDataAccess.includes(item.id));
  }, [selectedDataAccess]);

  const dataAccessPillRemove = useCallback(
    (id: string) => {
      setSelectedDataAccess(selectedDataAccess.filter(selectedId => selectedId !== id));
    },
    [selectedDataAccess],
  );

  return (
    <div className={styles.FilteringSidebarDataScope}>
      <Accordion
        title="Data type"
        type="secondary"
        pillsSlot={dataTypePills.length ? <SelectionPills selections={dataTypePills} onRemove={dataTypePillRemove} /> : null}
      >
        <div className={styles.AccordionContent}>
          <MultiselectButtons items={DATA_TYPE_ITEMS} selected={selectedDataType} onChange={onDataTypeChange} />
        </div>
      </Accordion>
      <Accordion
        title="Time"
        type="secondary"
        pillsSlot={timeFilterPill ? <SelectionPills selections={timeFilterPill} onRemove={TimePillRemove} /> : null}
      >
        <TimeFilter initialState={selectedTime} onChange={onTimeFilterChange} />
      </Accordion>
      <Accordion
        title="Data access"
        type="secondary"
        pillsSlot={dataAccessPills.length ? <SelectionPills selections={dataAccessPills} onRemove={dataAccessPillRemove} /> : null}
      >
        <div className={styles.AccordionContent}>
          <MultiselectButtons items={DATA_ACCESS_ITEMS} selected={selectedDataAccess} onChange={onDataAccessChange} />
        </div>
      </Accordion>
    </div>
  );
}
