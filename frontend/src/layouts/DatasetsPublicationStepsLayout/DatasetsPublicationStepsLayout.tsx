import { useEffect } from 'react';
import { Outlet, useLocation, useParams } from 'react-router';
import { Steps } from 'components/UI';
import styles from './DatasetsPublicationStepsLayout.module.scss';
import { useTranslation } from 'react-i18next';
import { LeaveIngestionModal } from 'components/AdminPortal/LeaveIngestionModal/LeaveIngestionModal';
import useIngestionFlow from 'hooks/useIngestionFlow';
import { useDataset } from 'hooks/useDatasets';
import { GISDataType } from 'types/backend';

export function DatasetsPublicationStepsLayout() {
  const { t } = useTranslation('admin');
  const { id: datasetId } = useParams();
  const { isLeaveModalVisible, confirmLeave, cancelLeave, isRaster, setIsRaster } = useIngestionFlow();
  const { data: dataset, isLoading } = useDataset(datasetId);

  useEffect(() => {
    if (dataset?.gis_datatype === GISDataType.RASTER) {
      setIsRaster(true);
    }
  }, [dataset, setIsRaster]);

  const location = useLocation();

  if (isLoading) return null;
  const pathSegments = location.pathname.split('/').filter(Boolean);
  const lastSegment = pathSegments[pathSegments.length - 1];

  const allSteps = [
    { key: 'general-info', title: t('datasets.general_info.step_title'), description: t('datasets.general_info.step_description') },
    { key: 'soil-data', title: t('datasets.soil_data.step_title'), description: t('datasets.soil_data.step_description') },
    { key: 'mappings', title: t('datasets.mappings.step_title'), description: t('datasets.mappings.step_description') },
    // TODO: quality check step will be implemented in a future version
    ...(isRaster ? [] : [{ key: 'preview', title: t('datasets.preview.step_title'), description: t('datasets.preview.step_description') }]),
  ];

  const currentIndex = Math.max(
    allSteps.findIndex(s => s.key === lastSegment),
    0,
  );

  return (
    <div className={styles.DatasetsPublicationStepsLayout}>
      <Steps steps={allSteps} currentIndex={currentIndex} />
      <div className={styles.Content}>
        <Outlet />
      </div>
      <LeaveIngestionModal visible={isLeaveModalVisible} onContinue={confirmLeave} onCancel={cancelLeave} />
    </div>
  );
}
