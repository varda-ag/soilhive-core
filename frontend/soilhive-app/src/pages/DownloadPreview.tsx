import { useContext } from 'react';
import { AvailabilityContext } from '../contexts/AvailabilityContext';
import { Button } from 'components/UI';
import styles from './DownloadPreview.module.scss';
import DownloadPreviewTable from 'components/DownloadPreview/DownloadPreviewTable';
import DownloadPreviewSummary from 'components/DownloadPreview/DownloadPreviewSummary';
import DownloadIcon from 'assets/icons/download-icon.svg?react';
import ArrowLeftIcon from 'assets/icons/arrow-left-icon.svg?react';
import BookmarkIcon from 'assets/icons/bookmark-icon.svg?react';

function DownloadPreview() {
  const availabilityContext = useContext(AvailabilityContext);

  if (!availabilityContext) {
    throw new Error('AvailabilityContext must be used within AvailabilityProvider');
  }

  const { setPreview } = availabilityContext;

  return (
    <div className={styles.Availability}>
      <div className={styles.Header}>
        <div className={styles.Titles}>
          <span>DATA PREVIEW</span>
          <span>Review your selected data before downloading</span>
        </div>
        <div className={styles.Buttons}>
          <Button type="tertiary" isIconOnly={true}>
            <BookmarkIcon />
          </Button>
          <Button
            type="secondary"
            onClick={() => {
              setPreview(false);
            }}
          >
            <ArrowLeftIcon />
            Back to the map
          </Button>
          <Button type="primary">
            <DownloadIcon />
            Download data
          </Button>
        </div>
      </div>
      <div className={styles.Content}>
        <div className={styles.Sidebar}>
          <DownloadPreviewSummary />
        </div>
        <div className={styles.Data}>
          <DownloadPreviewTable />
        </div>
      </div>
    </div>
  );
}

export default DownloadPreview;
