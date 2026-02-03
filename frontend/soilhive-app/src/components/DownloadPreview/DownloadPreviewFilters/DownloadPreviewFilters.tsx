import { Dropdown } from 'primereact/dropdown';
import { Calendar } from 'primereact/calendar';
import { Dialog } from 'primereact/dialog';
import type { Nullable } from 'primereact/ts-helpers';
import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import styles from './DownloadPreviewFilters.module.scss';
import useDevice from 'hooks/useDevice';
import { Button } from 'components/UI';

const datasets = [
  { name: 'iSDA Africa Field Data', value: 'isda' },
  { name: 'Dataset 2', value: 'dset2' },
  { name: 'Dataset 3', value: 'dset3' },
];

const soilProperties = [
  { name: 'Arsernic', value: 'arsenic' },
  { name: 'pH', value: 'ph' },
  { name: 'Nematode Hell', value: 'nematodehell' },
  { name: 'Very long soil property supercalifragilistichespiralidoso', value: 'longstringproperty' },
];

const depths = [
  { name: '0-15 cm', value: 'depth1' },
  { name: '15-30 cm', value: 'depth2' },
  { name: '30-60 cm', value: 'depth3' },
];

function DownloadPreviewFilters({
  dialogOpen = false,
  setDialogOpen,
}: {
  dialogOpen?: boolean;
  setDialogOpen?: Dispatch<SetStateAction<boolean>>;
}) {
  const { isMobileLayout } = useDevice();
  const [selectedDataset, setSelectedDataset] = useState<string>();
  const [selectedSoilProperty, setSelectedSoilProperty] = useState<string>();
  const [selectedDepth, setSelectedDepth] = useState<string>();
  const [selectedDateRange, setSelectedDateRange] = useState<Nullable<Array<Date | null>>>();

  const controls = useMemo(() => {
    return (
      <>
        <Dropdown
          className={styles.Dropdown}
          panelClassName={styles.DropdownPanel}
          value={selectedDataset}
          onChange={e => setSelectedDataset(e.value)}
          options={datasets}
          optionLabel="name"
          placeholder="Select a dataset"
        />
        <Dropdown
          className={styles.Dropdown}
          panelClassName={styles.DropdownPanel}
          value={selectedSoilProperty}
          onChange={e => setSelectedSoilProperty(e.value)}
          options={soilProperties}
          optionLabel="name"
          placeholder="Select a soil property"
        />
        <Dropdown
          className={styles.Dropdown}
          panelClassName={styles.DropdownPanel}
          value={selectedDepth}
          onChange={e => setSelectedDepth(e.value)}
          options={depths}
          optionLabel="name"
          placeholder="Select a depth"
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
        />
      </>
    );
  }, [selectedDataset, selectedSoilProperty, selectedDepth, selectedDateRange]);

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
