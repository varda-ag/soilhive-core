import classnames from 'classnames';
import { DocumentationLink } from '../DocumentationLink/DocumentationLink';

import styles from './IngestionStepTitleRow.module.scss';

interface Props {
  title: string;
  docsLink?: string;
  className?: string;
}

export function IngestionStepTitleRow({ title, docsLink, className }: Props) {
  return (
    <div className={classnames(styles.IngestionStepTitleRow, className)}>
      <h2 className={styles.Title}>{title}</h2>
      {!!docsLink && <DocumentationLink href={docsLink} />}
    </div>
  );
}
