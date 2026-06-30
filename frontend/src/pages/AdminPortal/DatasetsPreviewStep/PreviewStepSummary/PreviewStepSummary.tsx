import { useTranslation } from 'react-i18next';

import type { SoilDataSummary } from 'types/datasetsPublication';
import { InfoCard } from 'components/UI';

import { PreviewSummaryAccordion } from './PreviewSummaryAccordion/PreviewSummaryAccordion';
import styles from './PreviewStepSummary.module.scss';

interface Props {
  removedByUser: number;
  soilDataSummary: SoilDataSummary;
  isLoading: boolean;
}

const COLORS = {
  VALUES_MODIFIED: '#A2D141',
  ROWS_DELETED: '#820005',
  REMOVED_BY_USER: '#BC001F',
  CELLS_DELETED: '#F5B200',
};

export function PreviewStepSummary({ removedByUser, soilDataSummary, isLoading }: Props) {
  const { t } = useTranslation('admin');

  return (
    <div className={styles.PreviewStepSummary}>
      <div className={styles.PreviewStepSummaryCards}>
        <InfoCard
          className={styles.InfoCard}
          title={t('datasets.preview.summary.cards.values_modified.title')}
          primaryContent={{
            value: soilDataSummary.summary.values_modified,
            color: COLORS.VALUES_MODIFIED,
            description: t('datasets.preview.summary.cards.values_modified.description'),
          }}
          isLoading={isLoading}
        />
        <InfoCard
          className={styles.InfoCard}
          title={t('datasets.preview.summary.cards.rows_deleted.title')}
          primaryContent={{
            value: soilDataSummary.summary.rows_deleted,
            color: COLORS.ROWS_DELETED,
            description: t('datasets.preview.summary.cards.rows_deleted.description_1'),
          }}
          secondaryContent={{
            value: removedByUser,
            color: COLORS.REMOVED_BY_USER,
            description: t('datasets.preview.summary.cards.rows_deleted.description_2'),
          }}
          isLoading={isLoading}
        />
        <InfoCard
          className={styles.InfoCard}
          title={t('datasets.preview.summary.cards.cells_deleted.title')}
          primaryContent={{
            value: soilDataSummary.summary.cells_deleted,
            color: COLORS.CELLS_DELETED,
            description: t('datasets.preview.summary.cards.cells_deleted.description'),
          }}
          isLoading={isLoading}
        />
      </div>
      <div className={styles.PreviewStepSummaryAccordions}>
        <PreviewSummaryAccordion
          config={{
            color: COLORS.VALUES_MODIFIED,
            title: t('datasets.preview.summary.cards.values_modified.title'),
            total: soilDataSummary.summary.values_modified,
            items: [
              { label: t('datasets.preview.summary.reasons.depth_rounded'), value: soilDataSummary.modifications.depth_rounded },
              { label: t('datasets.preview.summary.reasons.value_rounded'), value: soilDataSummary.modifications.value_rounded },
              { label: t('datasets.preview.summary.reasons.unit_converted'), value: soilDataSummary.modifications.unit_converted },
            ],
          }}
        />
        <PreviewSummaryAccordion
          config={{
            color: COLORS.ROWS_DELETED,
            title: t('datasets.preview.summary.cards.rows_deleted.title'),
            total: soilDataSummary.summary.rows_deleted + removedByUser,
            items: [
              {
                label: t('datasets.preview.summary.reasons.invalid_coordinates'),
                value: soilDataSummary.row_deletions.invalid_coordinates,
              },
              {
                label: t('datasets.preview.summary.reasons.invalid_depth_interval'),
                value: soilDataSummary.row_deletions.invalid_depth_interval,
              },
              {
                label: t('datasets.preview.summary.reasons.minimum_data_requirement'),
                value: soilDataSummary.row_deletions.minimum_data_requirement,
              },
              { label: t('datasets.preview.summary.reasons.duplicate_row'), value: soilDataSummary.row_deletions.duplicate_row },
              { label: t('datasets.preview.summary.reasons.user_deletion'), value: removedByUser },
            ],
          }}
        />
        <PreviewSummaryAccordion
          isLast
          config={{
            color: COLORS.CELLS_DELETED,
            title: t('datasets.preview.summary.cards.cells_deleted.title'),
            total: soilDataSummary.summary.cells_deleted,
            items: [
              { label: t('datasets.preview.summary.reasons.non_numeric'), value: soilDataSummary.cell_deletions.non_numeric },
              { label: t('datasets.preview.summary.reasons.negative_value'), value: soilDataSummary.cell_deletions.negative_value },
              { label: t('datasets.preview.summary.reasons.zero_value'), value: soilDataSummary.cell_deletions.zero_value },
              { label: t('datasets.preview.summary.reasons.duplicate_cell'), value: soilDataSummary.cell_deletions.duplicate_cell },
              { label: t('datasets.preview.summary.reasons.out_of_bounds'), value: soilDataSummary.cell_deletions.out_of_bounds },
            ],
          }}
        />
      </div>
    </div>
  );
}
