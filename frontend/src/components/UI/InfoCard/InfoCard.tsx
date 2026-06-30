import classnames from 'classnames';
import Skeleton from 'react-loading-skeleton';

import type { InfoCardContent } from 'types/components';

import styles from './InfoCard.module.scss';

interface Props {
  title: string;
  primaryContent: InfoCardContent;
  secondaryContent?: InfoCardContent;
  className?: string;
  contentClassName?: string;
  isLoading?: boolean;
}

export function InfoCard({ title, primaryContent, secondaryContent, className, contentClassName, isLoading }: Props) {
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
            {isLoading && <Skeleton count={1} height={30} width={40} />}
            {!isLoading && primaryContent.value}
          </p>
          <p className={styles.Description}>{primaryContent.description}</p>
        </div>
        {!!secondaryContent && (
          <div className={classnames(styles.Content, styles.Secondary, contentClassName)}>
            <p className={styles.Value} style={{ color: secondaryContent.color }}>
              {isLoading && <Skeleton count={1} height={30} width={40} />}
              {!isLoading && secondaryContent.value}
            </p>
            <p className={styles.Description}>{secondaryContent.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}
