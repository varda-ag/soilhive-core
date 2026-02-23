import { Dropdown, type DropdownChangeEvent } from 'primereact/dropdown';
import { Calendar } from 'primereact/calendar';
import { Dialog } from 'primereact/dialog';
import type { FormEvent, Nullable } from 'primereact/ts-helpers';
import { useEffect, useState, type Dispatch, type SetStateAction, type SyntheticEvent } from 'react';
import styles from './DownloadPreviewFilters.module.scss';
import useDevice from 'hooks/useDevice';
import { Button } from 'components/UI';
import type { SoilProperty } from 'types/backend';
import type { PreviewFilters } from 'types/downloadPreview';

function DownloadPreviewFilters({
  soilProperties = [],
  filters = {},
  onFiltersChange,
  dialogOpen = false,
  setDialogOpen,
  datasets,
  fixedCalendarRange = null,
  calendarMinMaxRange = [undefined, undefined],
  depthMinMaxRange = [undefined, undefined],
  fixedDepthRange = null,
  selectedDatasets,
  onDatasetsChange,
  isLoading = true,
}: {
  soilProperties?: SoilProperty[];
  filters?: PreviewFilters;
  onFiltersChange?: (newFilters: PreviewFilters) => void;
  dialogOpen?: boolean;
  setDialogOpen?: Dispatch<SetStateAction<boolean>>;
  datasets?: { id: string; name: string }[];
  calendarMinMaxRange?: [Date | undefined, Date | undefined];
  fixedCalendarRange?: Nullable<Array<Date | null>>;
  depthMinMaxRange?: [number | undefined, number | undefined];
  fixedDepthRange?: Nullable<[number, number]>;
  selectedDatasets?: string[];
  onDatasetsChange?: (datasets: string[] | undefined) => void;
  isLoading?: boolean;
}) {
  const { isMobileLayout } = useDevice();
  const [selectedDateRange, setSelectedDateRange] = useState<Nullable<Array<Date | null>>>(fixedCalendarRange);

  useEffect(() => {
    if (fixedCalendarRange) return;

    const { min_sampling_date, max_sampling_date } = filters;

    if (min_sampling_date && max_sampling_date) {
      setSelectedDateRange([new Date(min_sampling_date), new Date(max_sampling_date)]);
      return;
    }

    setSelectedDateRange(null);
  }, [fixedCalendarRange, filters]);

  const depths = [
    ...Array.from({ length: Math.ceil((depthMinMaxRange?.[1] ?? 150) / 15) }, (_, i) => ({
      name: `${i * 15}cm - ${i * 15 + 15}cm`,
      id: `${i * 15}-${i * 15 + 15}`,
      range: [i * 15, i * 15 + 15],
    })),
    ...(fixedDepthRange ? [{ name: `${fixedDepthRange[0]}cm - ${fixedDepthRange[1]}cm`, id: 'fixed-range', range: fixedDepthRange }] : []),
  ];

  const { min_depth, max_depth } = filters;
  const selectedDepth =
    min_depth !== undefined && max_depth !== undefined
      ? depths.find(({ range }) => min_depth >= range[0] && max_depth <= range[1])?.id
      : undefined;

  const onDatasetsDropdownChange = (e: DropdownChangeEvent) => {
    onDatasetsChange?.(e.value ? [e.value] : undefined);
  };

  const onSoilPropertiesDropdownChange = (e: DropdownChangeEvent) => {
    if (e.value) {
      onFiltersChange?.({
        ...filters,
        soil_properties: [e.value],
      });
    } else {
      const { soil_properties: _, ...filtersWithoutSoilProperties } = filters;
      onFiltersChange?.(filtersWithoutSoilProperties);
    }
  };

  const onDepthRangeDropdownChange = (e: DropdownChangeEvent) => {
    const range = depths.find(({ id }) => e.value === id)?.range;
    if (range) {
      onFiltersChange?.({
        ...filters,
        min_depth: range[0],
        max_depth: range[1],
      });
    } else {
      const { min_depth: _, max_depth: __, ...filtersWithoutDepth } = filters;
      onFiltersChange?.(filtersWithoutDepth);
    }
  };

  const onCalendarChange = (e: FormEvent<(Date | null)[], SyntheticEvent<Element, Event>>) => {
    setSelectedDateRange(e.value);
  };

  const onCalendarHide = () => {
    if (!selectedDateRange || selectedDateRange?.some(date => date === null)) {
      const { min_sampling_date, max_sampling_date, ...filtersWithoutDates } = filters;
      if (!selectedDateRange?.[0] && !min_sampling_date && !selectedDateRange?.[1] && !max_sampling_date) return;
      onFiltersChange?.(filtersWithoutDates);
      setSelectedDateRange(null);
      return;
    }

    const min = (selectedDateRange[0] as unknown as Date).toISOString();
    const max = (selectedDateRange[1] as unknown as Date).toISOString();
    if (filters.min_sampling_date === min && filters.max_sampling_date === max) return;
    onFiltersChange?.({
      ...filters,
      // we know them not to be null because of the earlier range check
      min_sampling_date: min,
      max_sampling_date: max,
    });
  };

  const controls = (
    <>
      <Dropdown
        className={styles.Dropdown}
        panelClassName={styles.DropdownPanel}
        value={selectedDatasets?.[0]}
        onChange={onDatasetsDropdownChange}
        options={datasets}
        optionValue="id"
        optionLabel="name"
        placeholder="Select a dataset"
        disabled={isLoading}
      />
      <Dropdown
        className={styles.Dropdown}
        panelClassName={styles.DropdownPanel}
        value={filters.soil_properties?.[0]}
        onChange={onSoilPropertiesDropdownChange}
        options={soilProperties}
        optionLabel="property_name"
        optionValue="id"
        placeholder="Select a soil property"
        disabled={isLoading}
      />
      <Dropdown
        className={styles.Dropdown}
        panelClassName={styles.DropdownPanel}
        value={fixedDepthRange ? 'fixed-range' : selectedDepth}
        onChange={onDepthRangeDropdownChange}
        options={depths}
        optionLabel="name"
        optionValue="id"
        placeholder="Select a depth"
        showClear
        disabled={isLoading || !!fixedDepthRange}
      />
      <Calendar
        className={styles.Calendar}
        panelClassName={styles.DropdownPanel}
        inputClassName={styles.CalendarInput}
        readOnlyInput
        value={selectedDateRange}
        onChange={onCalendarChange}
        onHide={onCalendarHide}
        showButtonBar
        selectionMode="range"
        hideOnRangeSelection
        placeholder="Select a date range"
        showIcon
        minDate={calendarMinMaxRange[0]}
        maxDate={calendarMinMaxRange[1]}
        showMinMaxRange={true}
        disabled={isLoading || !!fixedCalendarRange}
      />
    </>
  );

  const closeDialog = () => {
    if (!dialogOpen) return;
    setDialogOpen?.(false);
  };

  return (
    <div className={styles.DownloadPreviewFilters}>
      <div className={styles.SectionTitle}>Filters</div>
      <div className={styles.Filters}>{!isMobileLayout && controls}</div>
      {isMobileLayout && (
        <Dialog
          className={styles.Dialog}
          headerClassName={styles.DialogHeader}
          header="Filters"
          visible={dialogOpen}
          dismissableMask
          draggable={false}
          onHide={closeDialog}
        >
          <div className={styles.DialogContent}>
            <div className={styles.Controls}>{controls}</div>
            <div className={styles.Footer}>
              <Button type="primary" size="small" onClick={closeDialog}>
                Apply filters
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export default DownloadPreviewFilters;
