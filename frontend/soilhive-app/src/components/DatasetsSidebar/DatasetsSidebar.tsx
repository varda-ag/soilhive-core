import { DatasetsSidebarHeader } from './DatasetsSidebarHeader/DatasetsSidebarHeader';
import { DatasetsSidebarSummary } from './DatasetsSidebarSummary/DatasetsSidebarSummary';
import { DatasetsList } from './DatasetsList/DatasetsList';
import { Button, PageSidebar } from 'components/UI';
import DownloadIcon from 'assets/icons/download-icon.svg?react';
import useDevice from 'hooks/useDevice';
import useAvailability from 'hooks/useAvailability';

import styles from './DatasetsSidebar.module.scss';
import { useNavigate } from 'react-router';

interface Props {
  isOpened: boolean;
  onClose: () => void;
}

export function DatasetsSidebar({ isOpened, onClose }: Props) {
  const { isDesktopLayout } = useDevice();
  const { setPreview, availableDatasets } = useAvailability();
  const navigate = useNavigate();

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
            isDisabled={availableDatasets.length === 0}
            onClick={() => {
              setPreview(true);
            }}
          >
            Preview
          </Button>
          <Button
            className={styles.DownloadButton}
            isDisabled={availableDatasets.length === 0}
            onClick={() => {
              navigate('/download');
            }}
          >
            <DownloadIcon />
            Download
          </Button>
        </div>
      </div>
    </PageSidebar>
  );
}
