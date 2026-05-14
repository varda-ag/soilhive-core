import { PrimeReactProvider } from 'primereact/api';
import { DataTable, type SortOrder } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { MultiSelect } from 'primereact/multiselect';
import styles from './DownloadPreviewTable.module.scss';
import { Button, Loader } from 'components/UI';
import NewspaperIcon from 'assets/icons/newspaper-icon.svg?react';
import MapPinIcon from 'assets/icons/small-map-icon.svg?react';
import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { SoilDataSample } from 'types/backend';
import { feature } from '@turf/turf';
import type { Feature, GeoJsonProperties, MultiPolygon, Point, Polygon } from 'geojson';
import { useTranslation } from 'react-i18next';
import { backendToLocalFrontendDate } from '../../../utilities/date';

function DownloadPreviewTable({
  data = [],
  isDataLoading = true,
  onTableSort,
  onTableLastPage,
  first = 0,
  setFirst,
  onFeatureSelected,
  selectedDatasets,
}: {
  data?: SoilDataSample[];
  isDataLoading?: boolean;
  onTableSort?: (sort: string | undefined) => void;
  onTableLastPage?: () => void;
  first?: number;
  setFirst?: Dispatch<SetStateAction<number>>;
  onFeatureSelected?: (feature: Feature<Point | Polygon | MultiPolygon, GeoJsonProperties> | undefined) => void;
  selectedDatasets?: string[];
}) {
  const metadataDatasetId = selectedDatasets?.[0];
  const isMetadataDisabled = isDataLoading || !metadataDatasetId;
  const { t } = useTranslation('download');

  const columns = useMemo(
    () => [
      { name: t('download_preview.columns.date'), value: 'sampling_date' },
      { name: t('download_preview.columns.depth_min'), value: 'min_depth' },
      { name: t('download_preview.columns.depth_max'), value: 'max_depth' },
      { name: t('download_preview.columns.value'), value: 'value' },
      { name: t('download_preview.columns.standard_unit'), value: 'standard_unit' },
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
    [t],
  );

  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    'sampling_date',
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

  const dateCell = ({ sampling_date }: SoilDataSample) => {
    if (!sampling_date) return '-';
    if (/^\d{4}$/.test(sampling_date)) return sampling_date;
    if (sampling_date.includes('-')) {
      const dateObj = backendToLocalFrontendDate(sampling_date);
      return !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString() : sampling_date;
    }
    return sampling_date;
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
            value={visibleColumns}
            options={columns}
            onChange={e => setVisibleColumns(e.value)}
            optionLabel="name"
            optionValue="value"
            placeholder={t('download_preview.select_columns')}
          />
          <Button
            type="tertiary"
            className={styles.MetadataButton}
            {...(isMetadataDisabled ? { isDisabled: true } : { href: `/datasets/${metadataDatasetId}` })}
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
              sortField={sortField}
              sortOrder={sortOrder}
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
                .filter(({ value }) => visibleColumns.includes(value))
                .map(({ name, value }) => {
                  const options = {
                    field: value,
                    header: name,
                    ...(value === 'sampling_date'
                      ? {
                          bodyClassName: styles.DateCell,
                          body: dateCell,
                        }
                      : {}),
                  };
                  return <Column key={value} sortable {...options}></Column>;
                })}
            </DataTable>
          </PrimeReactProvider>
          {isDataLoading && <Loader />}
        </div>
      </div>
    </div>
  );
}

export default DownloadPreviewTable;
