import { Dropdown, type DropdownChangeEvent } from 'primereact/dropdown';
import { Calendar } from 'primereact/calendar';
import { Dialog } from 'primereact/dialog';
import type { FormEvent, Nullable } from 'primereact/ts-helpers';
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction, type SyntheticEvent } from 'react';
import styles from './DownloadPreviewFilters.module.scss';
import useDevice from 'hooks/useDevice';
import { Button } from 'components/UI';
import { useTranslation } from 'react-i18next';
import type { SoilProperty } from 'types/backend';
import type { PreviewFilters } from 'types/downloadPreview';
import { backendToLocalFrontendDate, firstDayOfTheMonth, lastDayOfTheMonth } from '../../../utilities/date';

function DownloadPreviewFilters({
  soilProperties = [],
  filters = { soil_properties: [] },
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
  onDatasetsChange?: (datasets: string[]) => void;
  isLoading?: boolean;
}) {
  const { isMobileLayout } = useDevice();
  const { t } = useTranslation('download');
  const [selectedDateRange, setSelectedDateRange] = useState<Nullable<Array<Date | null>>>(fixedCalendarRange);

  const { minDate, maxDate, minMaxDateAreSameMonth } = useMemo(() => {
    if (!calendarMinMaxRange) return { minDate: undefined, maxDate: undefined };
    let minDate = calendarMinMaxRange[0];
    if (minDate) {
      minDate = firstDayOfTheMonth(minDate);
    }

    let maxDate = calendarMinMaxRange[1];
    if (maxDate) {
      maxDate = lastDayOfTheMonth(maxDate);
    }

    return {
      minDate,
      maxDate,
      minMaxDateAreSameMonth:
        minDate && maxDate && minDate.getMonth() === maxDate.getMonth() && minDate.getFullYear() === maxDate.getFullYear(),
    };
  }, [calendarMinMaxRange]);

  useEffect(() => {
    if (fixedCalendarRange) return;

    const { min_sampling_date, max_sampling_date } = filters;

    if (min_sampling_date && max_sampling_date) {
      const dateRange = [backendToLocalFrontendDate(min_sampling_date), lastDayOfTheMonth(backendToLocalFrontendDate(max_sampling_date))];
      setSelectedDateRange(dateRange);
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
    onDatasetsChange?.([e.value]);
  };

  const onSoilPropertiesDropdownChange = (e: DropdownChangeEvent) => {
    onFiltersChange?.({
      ...filters,
      soil_properties: [e.value],
    });
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

    const minDate = selectedDateRange[0] as unknown as Date;
    const min = `${minDate.getUTCFullYear()}-${String(minDate.getUTCMonth() + 1).padStart(2, '0')}-01`;

    const maxDate = lastDayOfTheMonth(selectedDateRange[1] as unknown as Date);
    const max = `${maxDate.getUTCFullYear()}-${String(maxDate.getUTCMonth() + 1).padStart(2, '0')}-${String(maxDate.getUTCDate()).padStart(2, '0')}`;

    if (filters.min_sampling_date === min && filters.max_sampling_date === max) return;
    onFiltersChange?.({
      ...filters,
      // we know them not to be null because of the earlier range check
      min_sampling_date: min,
      max_sampling_date: max,
    });
  };

  const { minSamplingDate, maxSamplingDate } = useMemo(() => {
    const { min_sampling_date, max_sampling_date } = filters;
    if (min_sampling_date && max_sampling_date) {
      return {
        minSamplingDate: firstDayOfTheMonth(backendToLocalFrontendDate(min_sampling_date)),
        maxSamplingDate: lastDayOfTheMonth(backendToLocalFrontendDate(max_sampling_date)),
      };
    }
    return {
      minSamplingDate: undefined,
      maxSamplingDate: undefined,
    };
  }, [filters]);

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
        placeholder={t('download_preview.select_dataset')}
        disabled={isLoading}
      />
      <Dropdown
        className={styles.Dropdown}
        panelClassName={styles.DropdownPanel}
        value={filters.soil_properties[0]}
        onChange={onSoilPropertiesDropdownChange}
        options={soilProperties}
        optionLabel="property_name"
        optionValue="id"
        placeholder={t('download_preview.select_soil_property')}
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
        placeholder={t('download_preview.select_depth')}
        showClear
        disabled={isLoading || !!fixedDepthRange}
      />
      <Calendar
        className={styles.Calendar}
        panelClassName={styles.DropdownPanel}
        inputClassName={styles.CalendarInput}
        readOnlyInput
        value={minMaxDateAreSameMonth ? [minDate ?? null, maxDate ?? null] : selectedDateRange}
        onChange={onCalendarChange}
        onHide={onCalendarHide}
        showButtonBar
        selectionMode="range"
        hideOnRangeSelection
        placeholder={t('download_preview.select_date_range')}
        showIcon
        view="month"
        dateFormat="mm/yy"
        minDate={minDate ?? minSamplingDate}
        maxDate={maxDate ?? maxSamplingDate}
        showMinMaxRange={true}
        disabled={isLoading || !!fixedCalendarRange || (!selectedDateRange && minMaxDateAreSameMonth)}
      />
    </>
  );

  const closeDialog = () => {
    if (!dialogOpen) return;
    setDialogOpen?.(false);
  };

  return (
    <div className={styles.DownloadPreviewFilters}>
      <div className={styles.SectionTitle}>{t('download_preview.filters')}</div>
      <div className={styles.Filters}>{!isMobileLayout && controls}</div>
      {isMobileLayout && (
        <Dialog
          className={styles.Dialog}
          headerClassName={styles.DialogHeader}
          header={t('download_preview.filters')}
          visible={dialogOpen}
          dismissableMask
          draggable={false}
          onHide={closeDialog}
        >
          <div className={styles.DialogContent}>
            <div className={styles.Controls}>{controls}</div>
            <div className={styles.Footer}>
              <Button type="primary" size="small" onClick={closeDialog}>
                {t('download_preview.apply_filters')}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export default DownloadPreviewFilters;
