import { DatasetsSidebarHeader } from './DatasetsSidebarHeader/DatasetsSidebarHeader';
import { DatasetsSidebarSummary } from './DatasetsSidebarSummary/DatasetsSidebarSummary';
import { DatasetsList } from './DatasetsList/DatasetsList';
import { Button, PageSidebar } from 'components/UI';
import DownloadIcon from 'assets/icons/small-download-icon.svg?react';
import useDevice from 'hooks/useDevice';
import useAvailability from 'hooks/useAvailability';
import useAvailabilityMap from 'hooks/useAvailabilityMap';
import { useTranslation } from 'react-i18next';

import styles from './DatasetsSidebar.module.scss';
import { useNavigate } from 'react-router';
import { GISDataType } from '../../types/backend';
import { useCallback } from 'react';

interface Props {
  isOpened: boolean;
  onClose: () => void;
}

export function DatasetsSidebar({ isOpened, onClose }: Props) {
  const { t } = useTranslation(['availability', 'common']);

  const { isDesktopLayout, isMobileLayout } = useDevice();
  const { availableDatasets, filterId, datasetFrontendFilters, datasetsSummary, isCoverageLoading, isDatasetsLoading } = useAvailability();
  const { selectionType, locationName } = useAvailabilityMap();

  const navigate = useNavigate();

  const handleDownloadClick = () => {
    navigate({ pathname: '/download', search: `?${getSearchParams({ source: 'availability' }).toString()}` });
  };

  const getSearchParams = useCallback(
    ({ source }: { source?: 'availability' } = {}) => {
      const params = new URLSearchParams();
      if (source) {
        params.append('source', source);
      }
      params.append('selectionType', `${selectionType}`);
      if (locationName) params.append('locationName', `${locationName}`);
      params.append('filterId', `${filterId}`);
      params.append('datasets', availableDatasets.map(dataset => dataset.id).join(','));
      return params;
    },
    [selectionType, locationName, filterId, availableDatasets],
  );

  return (
    <PageSidebar className={styles.DatasetsSidebar} isOpened={isOpened} position="right">
      <div className={styles.Wrapper}>
        {isDesktopLayout && <DatasetsSidebarHeader onClose={onClose} />}
        <DatasetsSidebarSummary
          datasetsSummary={datasetsSummary}
          isLoading={isCoverageLoading}
          isCountLoading={isDatasetsLoading && isCoverageLoading}
        />
        <DatasetsList />
        <div className={styles.Action}>
          <Button
            className={styles.PreviewButton}
            type="secondary"
            isDisabled={availableDatasets.filter(d => d.data_type !== GISDataType.RASTER).length === 0}
            onClick={() => {
              const searchParams = getSearchParams();
              if (datasetFrontendFilters.type.length) {
                searchParams.append('dataset-types', datasetFrontendFilters.type.join(','));
              }
              navigate({ pathname: '/explore', search: `?${searchParams.toString()}` });
            }}
          >
            {t('datasets_sidebar.explore')}
          </Button>
          <Button
            className={styles.DownloadButton}
            isDisabled={isMobileLayout || availableDatasets.length === 0}
            onClick={handleDownloadClick}
          >
            <DownloadIcon />
            {t('datasets_sidebar.download')}
          </Button>
        </div>
      </div>
    </PageSidebar>
  );
}
