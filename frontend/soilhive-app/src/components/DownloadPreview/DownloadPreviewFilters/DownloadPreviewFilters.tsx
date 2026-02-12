import { Dropdown } from 'primereact/dropdown';
import { Calendar } from 'primereact/calendar';
import { Dialog } from 'primereact/dialog';
import type { Nullable } from 'primereact/ts-helpers';
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import styles from './DownloadPreviewFilters.module.scss';
import useDevice from 'hooks/useDevice';
import { Button } from 'components/UI';
import type { SoilProperty } from 'types/backend';
import type { PreviewFilters } from 'types/downloadPreview';

const depths = [
  { name: '0-15 cm', value: 'depth1' },
  { name: '15-30 cm', value: 'depth2' },
  { name: '30-60 cm', value: 'depth3' },
];

function DownloadPreviewFilters({
  soilProperties = [],
  filters = {},
  onFiltersChange,
  dialogOpen = false,
  setDialogOpen,
  datasets,
  fixedCalendarRange = null,
  calendarMinMaxRange = [undefined, undefined],
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
  onDatasetsChange?: (dataset: string[] | undefined) => void;
  isLoading: boolean;
}) {
  const { isMobileLayout } = useDevice();
  const [selectedDataset, setSelectedDataset] = useState<string>();
  const [selectedDepth, setSelectedDepth] = useState<string>();
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

  const controls = useMemo(() => {
    return (
      <>
        <Dropdown
          className={styles.Dropdown}
          panelClassName={styles.DropdownPanel}
          value={selectedDataset}
          onChange={e => {
            setSelectedDataset(e.value);
            onDatasetsChange?.(e.value ? [e.value] : undefined);
          }}
          showClear
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
          onChange={e => {
            if (e.value) {
              onFiltersChange?.({
                ...filters,
                soil_properties: [e.value],
              });
            } else {
              const { soil_properties: _, ...filtersWithoutSoilProperties } = filters;
              onFiltersChange?.(filtersWithoutSoilProperties);
            }
          }}
          showClear
          options={soilProperties}
          optionLabel="property_name"
          optionValue="id"
          placeholder="Select a soil property"
          disabled={isLoading}
        />
        <Dropdown
          className={styles.Dropdown}
          panelClassName={styles.DropdownPanel}
          value={selectedDepth}
          onChange={e => setSelectedDepth(e.value)}
          options={depths}
          optionLabel="name"
          placeholder="Select a depth"
          disabled={isLoading}
        />
        <Calendar
          className={styles.Calendar}
          panelClassName={styles.DropdownPanel}
          inputClassName={styles.CalendarInput}
          value={selectedDateRange}
          onChange={e => setSelectedDateRange(e.value)}
          onHide={() => {
            if (!selectedDateRange || selectedDateRange?.some(date => date === null)) {
              const { min_sampling_date: _, max_sampling_date: __, ...filtersWithoutDates } = filters;
              onFiltersChange?.(filtersWithoutDates);
              setSelectedDateRange(null);
              return;
            }
            onFiltersChange?.({
              ...filters,
              // we know them not to be null because of the earlier range check
              min_sampling_date: (selectedDateRange[0] as unknown as Date).toISOString(),
              max_sampling_date: (selectedDateRange[1] as unknown as Date).toISOString(),
            });
          }}
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
  }, [
    selectedDataset,
    datasets,
    filters,
    selectedDepth,
    selectedDateRange,
    calendarMinMaxRange,
    fixedCalendarRange,
    isLoading,
    onFiltersChange,
    onDatasetsChange,
    soilProperties,
  ]);

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
