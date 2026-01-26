import { Button } from 'components/UI';
import FilterIcon from 'assets/icons/filter-icon.svg?react';
import styles from './DownloadPreviewDataSection.module.scss';
import DownloadPreviewTable from './DownloadPreviewTable';
import ShareIcon from 'assets/icons/share-icon.svg?react';
import DownloadPreviewFilters from './DownloadPreviewFilters';

function DownloadPreviewDataSection() {
  return (
    <div className={styles.DownloadPreviewDataSection}>
      <div className={styles.Controls}>
        <div className={styles.ControlsButtons}>
          <Button dataTestId="download-preview-data-section-filters-button" className={styles.FiltersButton} type="tertiary" size="small">
            <FilterIcon />
            Filters
          </Button>
        </div>
        <Button type="tertiary" isIconOnly={true} className={styles.ShareButton}>
          <ShareIcon />
        </Button>
      </div>
      <div className={styles.Filters}>
        <DownloadPreviewFilters />
      </div>
      <div className={styles.TabularPreview}>
        <DownloadPreviewTable />
      </div>
    </div>
  );
}

export default DownloadPreviewDataSection;
