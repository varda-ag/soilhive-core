import classnames from 'classnames';
import { useTranslation } from 'react-i18next';

import { Accordion } from 'components/UI';

import styles from './PreviewSummaryAccordion.module.scss';

interface PreviewSummaryAccordionItem {
  label: string;
  value: number;
}

interface PreviewSummaryAccordionConfig {
  color: string;
  title: string;
  total: number;
  items: PreviewSummaryAccordionItem[];
}

interface Props {
  config: PreviewSummaryAccordionConfig;
  isLast?: boolean;
}

export function PreviewSummaryAccordion({ config, isLast }: Props) {
  const { t } = useTranslation('admin');

  return (
    <Accordion
      type="custom"
      className={styles.PreviewSummaryAccordion}
      headerClassName={classnames(styles.AccordionHeader, { [styles.Last]: isLast })}
      headerOpenedClassName={styles.Opened}
      title={
        <div className={styles.AccordionTitle}>
          <div className={styles.ColorMark} style={{ backgroundColor: config.color }} />
          {config.title}
        </div>
      }
      headerLeftContent={<div className={styles.AccordionHeaderTotal}>{t('datasets.preview.summary.total', { number: config.total })}</div>}
    >
      <div className={styles.AccordionChildren}>
        {config.items.map(item => (
          <div key={item.label} className={styles.AccordionChildrenItem}>
            <p>{item.label}</p>
            <p>{item.value}</p>
          </div>
        ))}
        <div className={classnames(styles.AccordionChildrenItem, styles.AccordionChildrenTotal)}>
          <p>{t('datasets.preview.summary.reasons.total')}</p>
          <p>{config.total}</p>
        </div>
      </div>
    </Accordion>
  );
}
