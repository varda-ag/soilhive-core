import type { ReactNode } from 'react';
import classnames from 'classnames';

import type { InfoCardContent } from '../types';

import styles from './InfoCard.module.scss';

interface Props {
  title: string;
  primaryContent: InfoCardContent;
  secondaryContent?: InfoCardContent;
  className?: string;
  contentClassName?: string;
  isLoading?: boolean;
  loader?: ReactNode;
}

export function InfoCard({ title, primaryContent, secondaryContent, className, contentClassName, isLoading, loader }: Props) {
  return (
    <div
      className={classnames(styles.InfoCard, className, {
        [styles.Multicolumn]: !!secondaryContent,
      })}
      data-testid="sh-ui-infocard"
    >
      <h3 className={styles.Title}>{title}</h3>
      <div className={styles.ContentWrapper}>
        <div className={classnames(styles.Content, contentClassName)}>
          <p className={styles.Value} style={{ color: primaryContent.color }}>
            {isLoading && (loader || <>-</>)}
            {!isLoading && primaryContent.value}
          </p>
          <p className={styles.Description}>{primaryContent.description}</p>
        </div>
        {!!secondaryContent && (
          <div className={classnames(styles.Content, styles.Secondary, contentClassName)}>
            <p className={styles.Value} style={{ color: secondaryContent.color }}>
              {isLoading && (loader || <>-</>)}
              {!isLoading && secondaryContent.value}
            </p>
            <p className={styles.Description}>{secondaryContent.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}
