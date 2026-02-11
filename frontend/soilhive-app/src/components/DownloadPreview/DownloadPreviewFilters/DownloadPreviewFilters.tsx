import { Dropdown } from 'primereact/dropdown';
import { Calendar } from 'primereact/calendar';
import { Dialog } from 'primereact/dialog';
import type { Nullable } from 'primereact/ts-helpers';
import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import styles from './DownloadPreviewFilters.module.scss';
import useDevice from 'hooks/useDevice';
import { Button } from 'components/UI';
import type { SoilProperty } from 'types/backend';

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
  onDatasetsChange,
  isLoading = true,
}: {
  soilProperties?: SoilProperty[];
  filters?: { soil_properties?: string[] };
  onFiltersChange?: (newFilters: { soil_properties?: string[] }) => void;
  dialogOpen?: boolean;
  setDialogOpen?: Dispatch<SetStateAction<boolean>>;
  datasets?: { id: string; name: string }[];
  onDatasetsChange?: (dataset: string[] | undefined) => void;
  isLoading: boolean;
}) {
  const { isMobileLayout } = useDevice();
  const [selectedDataset, setSelectedDataset] = useState<string>();
  const [selectedDepth, setSelectedDepth] = useState<string>();
  const [selectedDateRange, setSelectedDateRange] = useState<Nullable<Array<Date | null>>>();

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
          selectionMode="range"
          hideOnRangeSelection
          placeholder="Select a date range"
          showIcon
          maxDate={new Date()}
          showMinMaxRange={true}
          disabled={isLoading}
        />
      </>
    );
  }, [selectedDataset, datasets, filters, filters.soil_properties, selectedDepth, selectedDateRange, isLoading]);

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
