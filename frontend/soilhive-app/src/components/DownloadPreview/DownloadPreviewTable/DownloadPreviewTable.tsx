import { PrimeReactProvider } from 'primereact/api';
import { DataTable, type SortOrder } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { MultiSelect } from 'primereact/multiselect';
import styles from './DownloadPreviewTable.module.scss';
import { Button } from 'components/UI';
import NewspaperIcon from 'assets/icons/newspaper-icon.svg?react';
import MapPinIcon from 'assets/icons/small-map-icon.svg?react';
import { useState, type Dispatch, type SetStateAction } from 'react';
import type { SoilDataSample } from 'types/backend';
import { feature } from '@turf/turf';
import type { Feature, GeoJsonProperties, MultiPolygon, Point, Polygon } from 'geojson';

const columns = [
  { name: 'Date', value: 'sampling_date' },
  { name: 'Depth (min)', value: 'min_depth' },
  { name: 'Depth (max)', value: 'max_depth' },
  { name: 'Value', value: 'value' },
  { name: 'Standard unit', value: 'standard_unit' },
  // TODO: to be restored | { name: 'Horizon', value: 'horizon' },
  { name: 'Technique', value: 'technique' },
  { name: 'Soil property', value: 'soil_property' },
  { name: 'Soil property acronym', value: 'property_acronym' },
  { name: 'Sample pretreatment', value: 'sample_pretreatment' },
  { name: 'Laboratory method', value: 'laboratory_method' },
  { name: 'Extractant concentration', value: 'extractant_concentration' },
  { name: 'Extraction ratio', value: 'extraction_ratio' },
  { name: 'Extraction base', value: 'extraction_base' },
  { name: 'Measurement procedure', value: 'measurement_procedure' },
  { name: 'Limit of detection', value: 'limit_of_detection' },
  { name: 'Dataset', value: 'dataset_name' },
  { name: 'License', value: 'license_name' },
];

function DownloadPreviewTable({
  data = [],
  isDataLoading = true,
  onTableSort,
  onTableLastPage,
  first = 0,
  setFirst,
  onFeatureSelected,
}: {
  data?: SoilDataSample[];
  isDataLoading?: boolean;
  onTableSort?: (sort: string | undefined) => void;
  onTableLastPage?: () => void;
  first?: number;
  setFirst?: Dispatch<SetStateAction<number>>;
  onFeatureSelected?: (feature: Feature<Point | Polygon | MultiPolygon, GeoJsonProperties> | undefined) => void;
}) {
  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    'sampling_date',
    'min_depth',
    'max_depth',
    'value',
    // TODO: to be restored | 'horizon',
    'technique',
    'license_name',
  ]);
  const [sortOrder, setSortOrder] = useState<SortOrder>();
  const [sortField, setSortField] = useState<string>();

  const dateCell = ({ sampling_date, geometry }: SoilDataSample) => {
    return (
      <Button
        type="tertiary"
        onClick={() => {
          onFeatureSelected?.(geometry ? feature(geometry as Point | Polygon | MultiPolygon) : undefined);
        }}
      >
        {geometry && <MapPinIcon />}
        {sampling_date ? new Date(sampling_date).toLocaleDateString() : '-'}
      </Button>
    );
  };

  return (
    <div className={styles.DownloadPreviewTable}>
      <div className={styles.SectionTitle}>Tabular preview</div>
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
            placeholder="Select columns to show"
          />
          <Button type="tertiary" className={styles.MetadataButton}>
            <NewspaperIcon />
            Metadata
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
              emptyMessage="No data available"
            >
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
                          headerClassName: styles.DateHeader,
                        }
                      : {}),
                  };
                  return <Column key={value} sortable {...options}></Column>;
                })}
            </DataTable>
          </PrimeReactProvider>
          {isDataLoading && (
            <div className={styles.LoaderOverlay}>
              <div className={styles.Loader}></div>
            </div>
          )}
        </div>
      </div>
      <div className={styles.Footer}>
        This is just a preview of the soil data we have filtered by area and the filters you selected, to see all the data available,
        download it.
      </div>
    </div>
  );
}

export default DownloadPreviewTable;
