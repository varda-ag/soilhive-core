import { PrimeReactProvider } from 'primereact/api';
import { DataTable, type SortOrder } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { MultiSelect } from 'primereact/multiselect';
import styles from './DownloadPreviewTable.module.scss';
import { Button, Loader } from 'components/UI';
import NewspaperIcon from 'assets/icons/newspaper-icon.svg?react';
import MapPinIcon from 'assets/icons/small-map-icon.svg?react';
import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { SoilDataSample } from 'types/backend';
import { feature } from '@turf/turf';
import type { Feature, GeoJsonProperties, MultiPolygon, Point, Polygon } from 'geojson';
import { useTranslation } from 'react-i18next';
import { backendToLocalFrontendDate } from '../../../utilities/date';
import { metadataPath } from 'configuration/routes';
import { formatRasterValue } from 'utilities/formatRasterValue';

const SAMPLING_DATE_COLUMN = 'sampling_date';
const REFERENCE_PERIOD_COLUMN = 'reference_period';

const rasterValueCell = ({ value }: SoilDataSample) => formatRasterValue(value);

function DownloadPreviewTable({
  data = [],
  isDataLoading = true,
  onTableSort,
  onTableLastPage,
  first = 0,
  setFirst,
  onFeatureSelected,
  selectedDatasets,
  isRasterDataset = false,
}: {
  data?: SoilDataSample[];
  isDataLoading?: boolean;
  onTableSort?: (sort: string | undefined) => void;
  onTableLastPage?: () => void;
  first?: number;
  setFirst?: Dispatch<SetStateAction<number>>;
  onFeatureSelected?: (feature: Feature<Point | Polygon | MultiPolygon, GeoJsonProperties> | undefined) => void;
  selectedDatasets?: string[];
  isRasterDataset?: boolean;
}) {
  const metadataDatasetId = selectedDatasets?.[0];
  const isMetadataDisabled = isDataLoading || !metadataDatasetId;
  const { t } = useTranslation('download');

  // A raster row has no sampling date: its Raster Layer's reference period takes the date column's place
  const dateColumn = isRasterDataset ? REFERENCE_PERIOD_COLUMN : SAMPLING_DATE_COLUMN;

  const columns = useMemo(
    () => [
      isRasterDataset
        ? { name: t('download_preview.columns.reference_period'), value: REFERENCE_PERIOD_COLUMN }
        : { name: t('download_preview.columns.date'), value: SAMPLING_DATE_COLUMN },
      { name: t('download_preview.columns.depth_min'), value: 'min_depth' },
      { name: t('download_preview.columns.depth_max'), value: 'max_depth' },
      { name: t('download_preview.columns.value'), value: 'value' },
      { name: t('download_preview.columns.standard_unit'), value: 'standard_unit' },
      ...(isRasterDataset ? [{ name: t('download_preview.columns.resolution'), value: 'resolution_m' }] : []),
      // TODO: to be restored | { name: t('download_preview.columns.horizon'), value: 'horizon' },
      { name: t('download_preview.columns.technique'), value: 'technique' },
      { name: t('download_preview.columns.sample_pretreatment'), value: 'sample_pretreatment' },
      { name: t('download_preview.columns.laboratory_method'), value: 'laboratory_method' },
      { name: t('download_preview.columns.extractant_concentration'), value: 'extractant_concentration' },
      { name: t('download_preview.columns.extraction_ratio'), value: 'extraction_ratio' },
      { name: t('download_preview.columns.extraction_base'), value: 'extraction_base' },
      { name: t('download_preview.columns.measurement_procedure'), value: 'measurement_procedure' },
      { name: t('download_preview.columns.limit_of_detection'), value: 'limit_of_detection' },
      { name: t('download_preview.columns.license'), value: 'license_name' },
    ],
    [t, isRasterDataset],
  );

  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    SAMPLING_DATE_COLUMN,
    'min_depth',
    'max_depth',
    'value',
    'standard_unit',
    // TODO: to be restored | 'horizon',
    'technique',
    'laboratory_method',
    'license_name',
  ]);
  const [sortOrder, setSortOrder] = useState<SortOrder>();
  const [sortField, setSortField] = useState<string>();

  // The date column is one slot whose key follows the Data Type, so hiding or showing it carries over
  // between kinds of Dataset. A column the current kind lacks (Resolution, for a vector Dataset) keeps
  // its choice for when it returns.
  const columnKeys = useMemo(() => new Set(columns.map(({ value }) => value)), [columns]);
  const toCurrentKey = (key: string) => (key === SAMPLING_DATE_COLUMN || key === REFERENCE_PERIOD_COLUMN ? dateColumn : key);
  const shownColumns = visibleColumns.map(toCurrentKey).filter(key => columnKeys.has(key));
  const onVisibleColumnsChange = (keys: string[]) =>
    setVisibleColumns([...keys, ...visibleColumns.filter(key => !columnKeys.has(toCurrentKey(key)))]);

  const dateCell = ({ sampling_date }: SoilDataSample) => {
    if (!sampling_date) return '-';
    if (/^\d{4}$/.test(sampling_date)) return sampling_date;
    if (sampling_date.includes('-')) {
      const dateObj = backendToLocalFrontendDate(sampling_date);
      return !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString() : sampling_date;
    }
    return sampling_date;
  };

  const referencePeriodCell = ({ reference_period_start: start, reference_period_stop: stop }: SoilDataSample) => {
    if (!start && !stop) return '-';
    if (start === stop) return start;
    return `${start ?? '…'} – ${stop ?? '…'}`;
  };

  const resolutionCell = ({ resolution_m }: SoilDataSample) => resolution_m ?? '-';

  const cellBodies: Record<string, { body: (sample: SoilDataSample) => ReactNode; bodyClassName?: string }> = {
    [SAMPLING_DATE_COLUMN]: { body: dateCell, bodyClassName: styles.DateCell },
    [REFERENCE_PERIOD_COLUMN]: { body: referencePeriodCell, bodyClassName: styles.DateCell },
    resolution_m: { body: resolutionCell },
    ...(isRasterDataset ? { value: { body: rasterValueCell } } : {}),
  };

  const mapPinCell = ({ geometry }: SoilDataSample) => {
    if (!geometry) return null;
    return <MapPinIcon />;
  };

  return (
    <div className={styles.DownloadPreviewTable}>
      <div className={styles.SectionTitle}>{t('download_preview.tabular_preview')}</div>
      <div className={styles.Content}>
        <div className={styles.TableControls}>
          <MultiSelect
            className={styles.MultiSelect}
            panelClassName={styles.MultiSelectPanel}
            itemClassName={styles.MultiSelectItem}
            value={shownColumns}
            options={columns}
            onChange={e => onVisibleColumnsChange(e.value)}
            optionLabel="name"
            optionValue="value"
            placeholder={t('download_preview.select_columns')}
          />
          <Button
            type="tertiary"
            className={styles.MetadataButton}
            {...(isMetadataDisabled ? { isDisabled: true } : { href: metadataPath(metadataDatasetId) })}
          >
            <NewspaperIcon />
            {t('download_preview.metadata')}
          </Button>
        </div>
        <div className={styles.TableContainer}>
          <PrimeReactProvider>
            <DataTable
              value={data}
              paginator
              rows={20}
              resizableColumns
              columnResizeMode="expand"
              reorderableColumns
              removableSort
              scrollable
              scrollHeight="flex"
              sortField={isRasterDataset ? undefined : sortField}
              sortOrder={isRasterDataset ? undefined : sortOrder}
              onSort={event => {
                const { sortField, sortOrder } = event;
                if (!sortOrder) onTableSort?.(undefined);
                else {
                  onTableSort?.(`${sortOrder < 0 ? '-' : ''}${sortField}`);
                }
                setSortField(sortField);
                setSortOrder(sortOrder);
              }}
              onPage={event => {
                const { page, totalPages } = event;
                if (page && totalPages) {
                  const isLastPage = totalPages - 1 - page === 0;
                  if (isLastPage) onTableLastPage?.();
                }
                setFirst?.(event.first);
              }}
              first={first}
              emptyMessage={t('download_preview.no_data_available')}
              onRowClick={({ data }) => {
                const sample = data as SoilDataSample;
                if (sample.geometry) {
                  onFeatureSelected?.(feature(sample.geometry as Point | Polygon | MultiPolygon));
                }
              }}
              rowClassName={(data: SoilDataSample) => (data.geometry ? styles.ClickableRow : '')}
            >
              <Column
                key="map_pin"
                bodyClassName={styles.MapPinCell}
                headerClassName={styles.MapPinHeader}
                body={mapPinCell}
                reorderable={false}
                resizeable={false}
                style={{ width: '48px', minWidth: '48px' }}
              />
              {columns
                .filter(({ value }) => shownColumns.includes(value))
                .map(({ name, value }) => (
                  // Raster rows come in a fixed order (docs/adr/0045), so a raster Dataset's columns don't sort
                  <Column key={value} field={value} header={name} sortable={!isRasterDataset} {...cellBodies[value]}></Column>
                ))}
            </DataTable>
          </PrimeReactProvider>
          {isDataLoading && <Loader />}
        </div>
      </div>
    </div>
  );
}

export default DownloadPreviewTable;
