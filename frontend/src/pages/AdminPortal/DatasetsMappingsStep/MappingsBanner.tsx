import { useTranslation } from 'react-i18next';
import classnames from 'classnames';
import CheckIconCircle from 'assets/icons/check-icon-circle.svg?react';
import WarningIcon from 'assets/icons/small-warning-icon.svg?react';
import QuestionIcon from 'assets/icons/question-round-icon.svg?react';
import styles from './MappingsBanner.module.scss';

interface Props {
  mappedCount: number;
  unmappedCount: number;
}

export function MappingsBanner({ mappedCount, unmappedCount }: Props) {
  const { t } = useTranslation('admin');

  return (
    <div className={styles.MappingsBanner} data-testid="sh-mappings-banner">
      <div className={styles.Pills}>
        <span className={classnames(styles.Pill, styles.PillMapped)}>
          <CheckIconCircle className={styles.PillIcon} />
          {mappedCount} {t('datasets.mappings.banner.mapped')}
        </span>
        <span className={classnames(styles.Pill, styles.PillUnmapped)}>
          <WarningIcon className={styles.PillIcon} />
          {unmappedCount} {t('datasets.mappings.banner.unmapped')}
        </span>
      </div>
      <div className={styles.Warning}>
        <QuestionIcon className={styles.WarningIcon} />
        <span className={styles.WarningText}>{t('datasets.mappings.banner.warning')}</span>
      </div>
    </div>
  );
}
