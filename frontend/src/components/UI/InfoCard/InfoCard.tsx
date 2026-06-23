import classnames from 'classnames';

import type { InfoCardContent } from 'types/components';

import styles from './InfoCard.module.scss';

interface Props {
  title: string;
  primaryContent: InfoCardContent;
  secondaryContent?: InfoCardContent;
  className?: string;
  contentClassName?: string;
}

export function InfoCard({ title, primaryContent, secondaryContent, className, contentClassName }: Props) {
  return (
    <div
      className={classnames(styles.InfoCard, className, {
        [styles.Multicolumn]: !!secondaryContent,
      })}
    >
      <h3 className={styles.Title}>{title}</h3>
      <div className={styles.ContentWrapper}>
        <div className={classnames(styles.Content, contentClassName)}>
          <p className={styles.Value} style={{ color: primaryContent.color }}>
            {primaryContent.value}
          </p>
          <p className={styles.Description}>{primaryContent.description}</p>
        </div>
        {!!secondaryContent && (
          <div className={classnames(styles.Content, contentClassName)}>
            <p className={styles.Value} style={{ color: secondaryContent.color }}>
              {secondaryContent.value}
            </p>
            <p className={styles.Description}>{secondaryContent.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}
