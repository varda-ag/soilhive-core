import { useTranslation } from 'react-i18next';
import classnames from 'classnames';

import { Accordion, InfoCard } from 'components/UI';

import styles from './PreviewStepSummary.module.scss';

interface Props {
  removedByUser: number;
}

export function PreviewStepSummary({ removedByUser }: Props) {
  const { t } = useTranslation('admin');

  return (
    <div className={styles.PreviewStepSummary}>
      <div className={styles.PreviewStepSummaryCards}>
        <InfoCard
          className={styles.InfoCard}
          title={t('datasets.preview.summary.cards.modified_values.title')}
          primaryContent={{
            value: 19,
            color: '#A2D141',
            description: t('datasets.preview.summary.cards.modified_values.description'),
          }}
        />
        <InfoCard
          className={styles.InfoCard}
          title={t('datasets.preview.summary.cards.deleted_rows.title')}
          primaryContent={{
            value: 107,
            color: '#820005',
            description: t('datasets.preview.summary.cards.deleted_rows.description_1'),
          }}
          secondaryContent={{
            value: removedByUser,
            color: '#BC001F',
            description: t('datasets.preview.summary.cards.deleted_rows.description_2'),
          }}
        />
        <InfoCard
          className={styles.InfoCard}
          title={t('datasets.preview.summary.cards.deleted_cells.title')}
          primaryContent={{
            value: 34,
            color: '#F5B200',
            description: t('datasets.preview.summary.cards.deleted_cells.description'),
          }}
        />
      </div>
      <div className={styles.PreviewStepSummaryAccordions}>
        <Accordion
          type="custom"
          headerClassName={styles.AccordionHeader}
          headerOpenedClassName={styles.Opened}
          title={
            <div className={styles.AccordionTitle}>
              <div className={styles.ColorMark} style={{ backgroundColor: '#A2D141' }} />
              {t('datasets.preview.summary.cards.modified_values.title')}
            </div>
          }
          headerLeftContent={<div className={styles.AccordionHeaderTotal}>{t('datasets.preview.summary.total', { number: '19' })}</div>}
        >
          <div className={styles.AccordionChildren}>
            <div className={styles.AccordionChildrenItem}>
              <p>{t('datasets.preview.summary.reasons.depth_rounded')}</p>
              <p>7</p>
            </div>
            <div className={styles.AccordionChildrenItem}>
              <p>{t('datasets.preview.summary.reasons.value_rounded')}</p>
              <p>5</p>
            </div>
            <div className={styles.AccordionChildrenItem}>
              <p>{t('datasets.preview.summary.reasons.unit_converted')}</p>
              <p>7</p>
            </div>
            <div className={classnames(styles.AccordionChildrenItem, styles.AccordionChildrenTotal)}>
              <p>{t('datasets.preview.summary.reasons.total')}</p>
              <p>19</p>
            </div>
          </div>
        </Accordion>
        <Accordion
          type="custom"
          headerClassName={styles.AccordionHeader}
          headerOpenedClassName={styles.Opened}
          title={
            <div className={styles.AccordionTitle}>
              <div className={styles.ColorMark} style={{ backgroundColor: '#820005' }} />
              {t('datasets.preview.summary.cards.deleted_rows.title')}
            </div>
          }
          headerLeftContent={
            <div className={styles.AccordionHeaderTotal}>{t('datasets.preview.summary.total', { number: 107 + removedByUser })}</div>
          }
        >
          <div className={styles.AccordionChildren}>
            <div className={styles.AccordionChildrenItem}>
              <p>{t('datasets.preview.summary.reasons.invalid_coordinates')}</p>
              <p>7</p>
            </div>
            <div className={styles.AccordionChildrenItem}>
              <p>{t('datasets.preview.summary.reasons.invalid_depth_interval')}</p>
              <p>5</p>
            </div>
            <div className={styles.AccordionChildrenItem}>
              <p>{t('datasets.preview.summary.reasons.minimum_data_requirement')}</p>
              <p>7</p>
            </div>
            <div className={styles.AccordionChildrenItem}>
              <p>{t('datasets.preview.summary.reasons.duplicate_row')}</p>
              <p>7</p>
            </div>
            <div className={styles.AccordionChildrenItem}>
              <p>{t('datasets.preview.summary.reasons.user_deletion')}</p>
              <p>{removedByUser}</p>
            </div>
            <div className={classnames(styles.AccordionChildrenItem, styles.AccordionChildrenTotal)}>
              <p>{t('datasets.preview.summary.reasons.total')}</p>
              <p>{26 + removedByUser}</p>
            </div>
          </div>
        </Accordion>
        <Accordion
          type="custom"
          className={styles.Accordion}
          headerClassName={styles.AccordionHeader}
          headerOpenedClassName={styles.Opened}
          title={
            <div className={styles.AccordionTitle}>
              <div className={styles.ColorMark} style={{ backgroundColor: '#F5B200' }} />
              {t('datasets.preview.summary.cards.deleted_cells.title')}
            </div>
          }
          headerLeftContent={<div className={styles.AccordionHeaderTotal}>{t('datasets.preview.summary.total', { number: '34' })}</div>}
        >
          <div className={styles.AccordionChildren}>
            <div className={styles.AccordionChildrenItem}>
              <p>{t('datasets.preview.summary.reasons.non_numeric')}</p>
              <p>7</p>
            </div>
            <div className={styles.AccordionChildrenItem}>
              <p>{t('datasets.preview.summary.reasons.negative_value')}</p>
              <p>5</p>
            </div>
            <div className={styles.AccordionChildrenItem}>
              <p>{t('datasets.preview.summary.reasons.zero_value')}</p>
              <p>7</p>
            </div>
            <div className={styles.AccordionChildrenItem}>
              <p>{t('datasets.preview.summary.reasons.duplicate_cell')}</p>
              <p>7</p>
            </div>
            <div className={styles.AccordionChildrenItem}>
              <p>{t('datasets.preview.summary.reasons.out_of_bounds')}</p>
              <p>7</p>
            </div>
            <div className={classnames(styles.AccordionChildrenItem, styles.AccordionChildrenTotal)}>
              <p>{t('datasets.preview.summary.reasons.total')}</p>
              <p>19</p>
            </div>
          </div>
        </Accordion>
      </div>
    </div>
  );
}
