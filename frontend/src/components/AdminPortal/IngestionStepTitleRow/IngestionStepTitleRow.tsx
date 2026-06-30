import classnames from 'classnames';
import { DocumentationLink } from '../DocumentationLink/DocumentationLink';

import styles from './IngestionStepTitleRow.module.scss';

interface Props {
  title: string;
  datasetName?: string;
  docsLink?: string;
  className?: string;
}

export function IngestionStepTitleRow({ title, datasetName, docsLink, className }: Props) {
  return (
    <div className={classnames(styles.IngestionStepTitleRow, className)}>
      <div className={styles.Left}>
        <h2 className={styles.Title}>{title}</h2>
        {!!datasetName && (
          <>
            <div className={styles.Separator} />
            <p className={styles.DatasetName}>{datasetName}</p>
          </>
        )}
      </div>
      {!!docsLink && <DocumentationLink href={docsLink} />}
    </div>
  );
}
