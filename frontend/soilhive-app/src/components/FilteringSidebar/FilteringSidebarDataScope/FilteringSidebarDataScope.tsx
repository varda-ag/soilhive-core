import { useCallback, useMemo, useState } from 'react';
import { TimeFilter } from './TimeFilter/TimeFilter';
import { Accordion, MultiselectButtons, SelectionPills } from 'components/UI';
import type { Selection } from 'types/components';
import type { TimeFilterState } from 'types/availability';
import useAvailability from 'hooks/useAvailability';
import { yearRangeToDatasetFilters } from '../../../adapters';

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
  const { datasetFrontendFilters, typeFilterOptions, setFrontendFilters, setDatasetFilters } = useAvailability();
  const [selectedTime, setSelectedTime] = useState<TimeFilterState>({});

  const onDataTypeChange = useCallback(
    (selected: string[]) => {
      setFrontendFilters(selected, 'type');
    },
    [setFrontendFilters],
  );

  const availableTypeFilters = useMemo((): Selection[] => {
    return DATA_TYPE_ITEMS.filter(item => typeFilterOptions.includes(item.id));
  }, [typeFilterOptions]);

  const dataTypePills = useMemo((): Selection[] => {
    return DATA_TYPE_ITEMS.filter(item => datasetFrontendFilters.type.includes(item.id));
  }, [datasetFrontendFilters.type]);

  const dataTypePillRemove = useCallback(
    (id: string) => {
      setFrontendFilters(
        datasetFrontendFilters.type.filter(selectedId => selectedId !== id),
        'type',
      );
    },
    [datasetFrontendFilters.type, setFrontendFilters],
  );

  const resetTimeFilter = useCallback(() => {
    setDatasetFilters(prevFilters => {
      return { ...prevFilters, min_sampling_date: undefined, max_sampling_date: undefined };
    });
  }, [setDatasetFilters]);

  const onTimeFilterChange = useCallback(
    (value: TimeFilterState) => {
      setSelectedTime(value);

      setDatasetFilters(prevFilters => {
        return { ...prevFilters, ...yearRangeToDatasetFilters(value) };
      });
    },
    [setDatasetFilters],
  );

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
    resetTimeFilter();
  }, [resetTimeFilter]);

  const onDataAccessChange = useCallback(
    (selected: string[]) => {
      setFrontendFilters(selected, 'ownership');
    },
    [setFrontendFilters],
  );

  const dataAccessPills = useMemo((): Selection[] => {
    return DATA_ACCESS_ITEMS.filter(item => datasetFrontendFilters.ownership.includes(item.id));
  }, [datasetFrontendFilters.ownership]);

  const dataAccessPillRemove = useCallback(
    (id: string) => {
      setFrontendFilters(
        datasetFrontendFilters.ownership.filter(selectedId => selectedId !== id),
        'ownership',
      );
    },
    [datasetFrontendFilters.ownership, setFrontendFilters],
  );

  return (
    <div className={styles.FilteringSidebarDataScope}>
      <Accordion
        title="Data type"
        type="secondary"
        pillsSlot={dataTypePills.length ? <SelectionPills selections={dataTypePills} onRemove={dataTypePillRemove} /> : null}
      >
        <div className={styles.AccordionContent}>
          <MultiselectButtons items={availableTypeFilters} selected={datasetFrontendFilters.type} onChange={onDataTypeChange} />
        </div>
      </Accordion>
      <Accordion
        title="Time"
        type="secondary"
        pillsSlot={timeFilterPill ? <SelectionPills selections={timeFilterPill} onRemove={TimePillRemove} /> : null}
      >
        {!timeFilterPill && <TimeFilter initialState={selectedTime} onChange={onTimeFilterChange} />}
      </Accordion>
      <Accordion
        title="Data access"
        type="secondary"
        pillsSlot={dataAccessPills.length ? <SelectionPills selections={dataAccessPills} onRemove={dataAccessPillRemove} /> : null}
      >
        <div className={styles.AccordionContent}>
          <MultiselectButtons items={DATA_ACCESS_ITEMS} selected={datasetFrontendFilters.ownership} onChange={onDataAccessChange} />
        </div>
      </Accordion>
    </div>
  );
}
