import { Outlet, useLocation } from 'react-router';
import { Steps } from 'components/UI';
import styles from './DatasetsPublicationStepsLayout.module.scss';
import { useTranslation } from 'react-i18next';

type StepPath = keyof typeof indexMap;

const indexMap = {
  'general-info': 0,
  'soil-data': 1,
  mappings: 2,
  preview: 3,
  // TODO: quality check step will be implemented in a future version
  // 'quality-check': 4,
} as const;

export function DatasetsPublicationStepsLayout() {
  const { t } = useTranslation('admin');

  const location = useLocation();
  const pathSegments = location.pathname.split('/').filter(Boolean);
  const lastSegment = pathSegments[pathSegments.length - 1];
  const currentIndex = lastSegment in indexMap ? indexMap[lastSegment as StepPath] : 0;

  return (
    <div className={styles.DatasetsPublicationStepsLayout}>
      <Steps
        steps={[
          { title: t('datasets.general_info.step_title'), description: t('datasets.general_info.step_description') },
          { title: t('datasets.soil_data.step_title'), description: t('datasets.soil_data.step_description') },
          { title: t('datasets.mappings.step_title'), description: t('datasets.mappings.step_description') },
          { title: t('datasets.preview.step_title'), description: t('datasets.preview.step_description') },
          // TODO: quality check step will be implemented in a future version
          // { title: t('datasets.quality_check.step_title'), description: t('datasets.quality_check.step_description') },
        ]}
        currentIndex={currentIndex}
      />
      <div className={styles.Content}>
        <Outlet />
      </div>
    </div>
  );
}
