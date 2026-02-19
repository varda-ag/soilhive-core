import { DatasetsSidebarHeader } from './DatasetsSidebarHeader/DatasetsSidebarHeader';
import { DatasetsSidebarSummary } from './DatasetsSidebarSummary/DatasetsSidebarSummary';
import { DatasetsList } from './DatasetsList/DatasetsList';
import { Button, PageSidebar } from 'components/UI';
import DownloadIcon from 'assets/icons/download-icon.svg?react';
import useDevice from 'hooks/useDevice';

import styles from './DatasetsSidebar.module.scss';
import { AvailabilityContext } from '../../contexts/AvailabilityContext';
import { useContext } from 'react';

interface Props {
  isOpened: boolean;
  onClose: () => void;
}

export function DatasetsSidebar({ isOpened, onClose }: Props) {
  const { isDesktopLayout } = useDevice();
  const availabilityContext = useContext(AvailabilityContext);
  if (!availabilityContext) {
    throw new Error('AvailabilityContext must be used within AvailabilityProvider');
  }
  const { setPreview, datasets } = availabilityContext;

  return (
    <PageSidebar className={styles.DatasetsSidebar} isOpened={isOpened} position="right">
      <div className={styles.Wrapper}>
        {isDesktopLayout && <DatasetsSidebarHeader onClose={onClose} />}
        <DatasetsSidebarSummary />
        <DatasetsList />
        <div className={styles.Action}>
          <Button
            className={styles.PreviewButton}
            type="secondary"
            isDisabled={datasets.length === 0}
            onClick={() => {
              setPreview(true);
            }}
          >
            Preview
          </Button>
          <Button className={styles.DownloadButton} isDisabled={true}>
            <DownloadIcon />
            Download
          </Button>
        </div>
      </div>
    </PageSidebar>
  );
}
