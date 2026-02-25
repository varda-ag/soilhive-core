import { Button } from 'components/UI';
import FilterIcon from 'assets/icons/filter-icon.svg?react';
import styles from './DownloadPreviewDataSection.module.scss';
import ShareIcon from 'assets/icons/share-icon.svg?react';
import DownloadPreviewFilters from '../DownloadPreviewFilters/DownloadPreviewFilters';
import DownloadPreviewTable from '../DownloadPreviewTable/DownloadPreviewTable';
import { useState } from 'react';
import type { SoilDataSample, SoilProperty } from 'types/backend';
import type { PreviewFilters } from 'types/downloadPreview';
import type { Nullable } from 'primereact/ts-helpers';
import type { Feature, GeoJsonProperties, MultiPolygon, Point, Polygon } from 'geojson';

function DownloadPreviewDataSection({
  data = [],
  isDataLoading = true,
  onTableSort,
  onTableLastPage,
  soilProperties = [],
  filters = {},
  calendarMinMaxRange = [undefined, undefined],
  fixedCalendarRange = null,
  depthMinMaxRange = [undefined, undefined],
  fixedDepthRange = null,
  onFiltersChange,
  datasets = [],
  selectedDatasets,
  onDatasetsChange,
  onFeatureSelected,
}: {
  data?: SoilDataSample[];
  isDataLoading?: boolean;
  onTableSort?: (sort: string | undefined) => void;
  onTableLastPage?: () => void;
  soilProperties?: SoilProperty[];
  calendarMinMaxRange?: [Date | undefined, Date | undefined];
  fixedCalendarRange?: Nullable<Array<Date | null>>;
  depthMinMaxRange?: [number | undefined, number | undefined];
  fixedDepthRange?: Nullable<[number, number]>;
  filters?: PreviewFilters;
  onFiltersChange?: (newFilters: PreviewFilters) => void;
  datasets?: { id: string; name: string }[];
  selectedDatasets?: string[];
  onDatasetsChange?: (dataset: string[] | undefined) => void;
  onFeatureSelected?: (feature: Feature<Point | Polygon | MultiPolygon, GeoJsonProperties> | undefined) => void;
}) {
  const [filtersDialogOpen, setFiltersDialogOpen] = useState(false);

  const [tableFirst, setTableFirst] = useState<number>(0);

  function resetPagination() {
    setTableFirst(0);
  }

  return (
    <div className={styles.DownloadPreviewDataSection}>
      <div className={styles.Controls}>
        <div className={styles.ControlsButtons}>
          <Button
            dataTestId="download-preview-data-section-filters-button"
            className={styles.FiltersButton}
            type={filtersDialogOpen ? 'primary' : 'secondary'}
            size="small"
            onClick={() => setFiltersDialogOpen(true)}
          >
            <FilterIcon />
            Filters
          </Button>
        </div>
        <Button dataTestId="download-preview-data-section-share-button" type="tertiary" isIconOnly={true} className={styles.ShareButton}>
          <ShareIcon />
        </Button>
      </div>
      <div className={styles.Filters}>
        <DownloadPreviewFilters
          soilProperties={soilProperties}
          filters={filters}
          onFiltersChange={newFilters => {
            resetPagination();
            onFiltersChange?.(newFilters);
          }}
          dialogOpen={filtersDialogOpen}
          setDialogOpen={setFiltersDialogOpen}
          datasets={datasets}
          calendarMinMaxRange={calendarMinMaxRange}
          fixedCalendarRange={fixedCalendarRange}
          depthMinMaxRange={depthMinMaxRange}
          fixedDepthRange={fixedDepthRange}
          selectedDatasets={selectedDatasets}
          onDatasetsChange={datasets => {
            resetPagination();
            onDatasetsChange?.(datasets);
          }}
          isLoading={isDataLoading}
        />
      </div>
      <div className={styles.TabularPreview}>
        <DownloadPreviewTable
          data={data}
          isDataLoading={isDataLoading}
          first={tableFirst}
          setFirst={setTableFirst}
          onTableSort={sort => {
            resetPagination();
            onTableSort?.(sort);
          }}
          onTableLastPage={onTableLastPage}
          onFeatureSelected={onFeatureSelected}
        />
      </div>
    </div>
  );
}

export default DownloadPreviewDataSection;
