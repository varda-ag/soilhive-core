import { Button } from 'components/UI';
import FilterIcon from 'assets/icons/filter-icon.svg?react';
import styles from './DownloadPreviewDataSection.module.scss';
import ShareIcon from 'assets/icons/share-icon.svg?react';
import DownloadPreviewFilters from '../DownloadPreviewFilters/DownloadPreviewFilters';
import DownloadPreviewTable from '../DownloadPreviewTable/DownloadPreviewTable';
import { useState } from 'react';
import type { SoilDataSample, SoilProperty } from 'types/backend';

function DownloadPreviewDataSection({
  data = [],
  isDataLoading = true,
  onTableSort,
  onTableLastPage,
  soilProperties = [],
  filters = {},
  onFiltersChange,
  datasets = [],
  onDatasetsChange,
}: {
  data?: SoilDataSample[];
  isDataLoading?: boolean;
  onTableSort?: (sort: string | undefined) => void;
  onTableLastPage?: () => void;
  soilProperties?: SoilProperty[];
  filters?: { soil_properties?: string[] };
  onFiltersChange?: (newFilters: { soil_properties?: string[] }) => void;
  datasets?: { id: string; name: string }[];
  onDatasetsChange?: (dataset: string[] | undefined) => void;
}) {
  const [filtersDialogOpen, setFiltersDialogOpen] = useState(false);
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
          onFiltersChange={onFiltersChange}
          dialogOpen={filtersDialogOpen}
          setDialogOpen={setFiltersDialogOpen}
          datasets={datasets}
          onDatasetsChange={onDatasetsChange}
          isLoading={isDataLoading}
        />
      </div>
      <div className={styles.TabularPreview}>
        <DownloadPreviewTable data={data} isDataLoading={isDataLoading} onTableSort={onTableSort} onTableLastPage={onTableLastPage} />
      </div>
    </div>
  );
}

export default DownloadPreviewDataSection;
