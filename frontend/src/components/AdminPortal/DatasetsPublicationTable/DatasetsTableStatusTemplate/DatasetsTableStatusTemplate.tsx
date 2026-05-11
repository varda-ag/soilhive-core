import { useTranslation } from 'react-i18next';
import classnames from 'classnames';

import { Tag } from 'components/UI';
import { IngestionStatus } from 'types/backend';

import styles from './DatasetsTableStatusTemplate.module.scss';

interface Props {
  status: IngestionStatus;
}

export function DatasetsTableStatusTemplate({ status }: Props) {
  const { t } = useTranslation('admin');

  return <Tag text={t(`datasets.list.status.${status}`)} className={classnames(styles.Tag, styles[status])} />;
}
