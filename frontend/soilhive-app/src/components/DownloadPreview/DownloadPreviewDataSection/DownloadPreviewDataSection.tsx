import { Button } from 'components/UI';
import FilterIcon from 'assets/icons/filter-icon.svg?react';
import styles from './DownloadPreviewDataSection.module.scss';
import ShareIcon from 'assets/icons/share-icon.svg?react';
import DownloadPreviewFilters from '../DownloadPreviewFilters/DownloadPreviewFilters';
import DownloadPreviewTable from '../DownloadPreviewTable/DownloadPreviewTable';
import { useState } from 'react';

function DownloadPreviewDataSection() {
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
        <DownloadPreviewFilters dialogOpen={filtersDialogOpen} setDialogOpen={setFiltersDialogOpen} />
      </div>
      <div className={styles.TabularPreview}>
        <DownloadPreviewTable />
      </div>
    </div>
  );
}

export default DownloadPreviewDataSection;
